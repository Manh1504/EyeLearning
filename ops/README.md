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
