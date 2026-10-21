# ops/ — Script vận hành

Bộ script vận hành production. Chạy trên **host EC2** (nơi Docker/Portainer chạy),
KHÔNG chạy trên máy dev. Không chứa secret — credential đọc từ biến môi trường.

## Cài đặt nhanh

```bash
chmod +x ops/*.sh
```

## `pg_backup.sh` — sao lưu DB

Sao lưu container `eyetracking-postgres` bằng `pg_dump -Fc`, nén `.gz`, giữ N bản
gần nhất, tùy chọn đẩy lên Cloudflare R2 (S3-compatible).

```bash
# Biến tối thiểu (DB local trong docker thường không cần PGPASSWORD)
export PGPASSWORD='<password-db>'
export BACKUP_DIR=/var/backups/eyelearning
export BACKUP_KEEP=7

# Tùy chọn: đẩy lên R2
export S3_ENDPOINT='https://<account-id>.r2.cloudflarestorage.com'
export S3_BUCKET='eyelearning-backups'
export S3_PREFIX='pg'
export AWS_DEFAULT_REGION='auto'
export AWS_ACCESS_KEY_ID='<r2-access-key>'
export AWS_SECRET_ACCESS_KEY='<r2-secret-key>'

./ops/pg_backup.sh
```

> Khuyến nghị: để credential trong file ngoài repo (vd `~/.eyelearning.env`,
> `chmod 600`) rồi `source` trước khi chạy — KHÔNG commit vào git.

## `pg_restore_test.sh` — kiểm thử khôi phục

Restore bản dump mới nhất vào một Postgres **tạm** (container riêng, không dùng
volume) và in số dòng vài bảng chính. Dùng để định kỳ xác nhận backup còn tốt.

```bash
export BACKUP_DIR=/var/backups/eyelearning
./ops/pg_restore_test.sh
```

## `docker_cleanup.sh` — dọn image/build cache

Chỉ `docker image prune` và `docker builder prune` cho tài nguyên cũ hơn 168h (7 ngày).

> ⚠️ **KHÔNG BAO GIỜ prune volume.** Volume chứa `pgdata`, `backend-media`,
> `gaze-weights`, `redis-data`. Prune volume = mất dữ liệu vĩnh viễn.
> Script này cố tình không gọi `docker volume prune` / `docker system prune --volumes`.

```bash
./ops/docker_cleanup.sh
```

## `build_ai_base.sh` — build image nền dùng chung

Build image nền `ghcr.io/manh1504/eyelearning-ai-base:latest` (torch/torchvision
CUDA 12.4) mà cả `services/gaze` và `services/chatbot` đều `FROM`. Phải có image
này trước khi build 2 service ở local (CI tự build/push khi `docker/ai-base/**` đổi).

```bash
./ops/build_ai_base.sh
```

## `maintain_partitions.sql` — bảo trì partition gaze_events

Gọi `create_gaze_partitions(3)` để tạo partition tháng mới. Trong
`docker-compose.yml`, service `db-maintenance` đã tự gọi mỗi 24h — file này chỉ
để chạy thủ công:

```bash
psql -d eyetracking -f ops/maintain_partitions.sql
```

## Migration (schema DB)

Schema do các file trong `db/migrations/` quyết định. Runner `db/migrate.sh` (nằm
trong image `eyelearning-migrations`, service một-lần `migrate`) là thứ duy nhất
nên chạy migration trên production — **không** `psql -f` tay từng file.

Cơ chế:

- Bảng `schema_migrations` lưu `filename` + `checksum` sha256 của mọi file đã áp;
  lần deploy sau **chỉ chạy file chưa áp** (deploy nhanh, không phụ thuộc idempotency).
- File đã áp mà bị **sửa nội dung** → runner dừng ngay, in rõ checksum cũ/mới.
  Muốn đổi schema thì **thêm file mới** (`021_…`) — không sửa file cũ.
- DB cũ chưa có `schema_migrations` (server trước lần deploy đầu tiên với runner
  mới) → chạy toàn bộ như trước rồi ghi dấu; mọi file đều idempotent nên an toàn.
- Service `migrate` exit 1 ⇒ compose **huỷ cả lần deploy** và các container cũ vẫn
  chạy. Vì vậy thấy lỗi deploy thì xem log: `docker logs eyetracking-migrate`.

Xem file nào đã áp:

```bash
docker exec eyetracking-postgres psql -U postgres -d eyetracking \
  -c "SELECT filename, applied_at, duration_ms FROM schema_migrations ORDER BY filename;"
```

Thêm file migration mới thì phải cập nhật checksum đã chốt (CI bắt buộc):

```bash
MIGRATE_UPDATE_CHECKSUMS=1 bash db/migrate.sh   # ghi lại db/migrations.checksums.txt
```

Ghi dấu mà KHÔNG chạy (chỉ khi DB đã đúng schema nhưng bảng tracking còn trống —
**không dùng cho server đang thiếu migration**, vì sẽ bỏ qua file thật sự cần chạy):

```bash
docker exec -e MIGRATE_BASELINE=1 eyetracking-migrate bash /migrate.sh /migrations
```

Kiểm tra đường nâng cấp (CI tự chạy ở job `migrations`; chạy tay cần 2 DB trống):

```bash
PGDATABASE=db_a bash db/migrate.sh /tmp/migrations-cu   # bộ migration của bản đang chạy
PGDATABASE=db_a bash db/migrate.sh db/migrations        # áp bộ mới lên DB đó
PGDATABASE=db_b bash db/migrate.sh db/migrations        # dựng mới hoàn toàn
psql -tA -d db_a -f db/schema_fingerprint.sql > /tmp/a.txt
psql -tA -d db_b -f db/schema_fingerprint.sql > /tmp/b.txt
diff -u /tmp/a.txt /tmp/b.txt      # phải không có khác biệt
```

Nên chạy `./ops/pg_backup.sh` trước mỗi lần deploy có migration mới.

## Crontab mẫu

```cron
# Sao lưu DB 02:00 hằng ngày, log ra file riêng
0 2 * * * cd /opt/eyelearning && set -a && . /home/ubuntu/.eyelearning.env && set +a && BACKUP_DIR=/var/backups/eyelearning ./ops/pg_backup.sh >> /var/log/eyelearning-backup.log 2>&1

# Kiểm thử restore 03:00 Chủ nhật hằng tuần
0 3 * * 0 cd /opt/eyelearning && BACKUP_DIR=/var/backups/eyelearning ./ops/pg_restore_test.sh >> /var/log/eyelearning-restore-test.log 2>&1

# Dọn Docker 04:00 thứ Bảy hằng tuần
0 4 * * 6 cd /opt/eyelearning && ./ops/docker_cleanup.sh >> /var/log/eyelearning-cleanup.log 2>&1
```

## Khôi phục thủ công (khi cần)

```bash
# 1. Giải nén bản dump cần dùng
gunzip -c /var/backups/eyelearning/eyetracking_YYYYMMDD-HHMMSS.dump.gz > /tmp/restore.dump

# 2. Restore vào DB (CẢNH BÁO: --clean xóa object hiện có trong DB đích)
docker exec -i eyetracking-postgres pg_restore \
  -U postgres -d eyetracking --no-owner --no-privileges --if-exists --clean < /tmp/restore.dump
```

## Kiểm tra dung lượng đĩa

```bash
df -h                      # dung lượng phân vùng
docker system df           # dung lượng Docker (image/container/volume/build cache)
docker system df -v        # chi tiết từng image/volume
du -sh /var/backups/eyelearning   # dung lượng thư mục backup
```
