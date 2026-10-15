#!/usr/bin/env bash
# =====================================================================
# pg_backup.sh — sao lưu PostgreSQL (container eyetracking-postgres)
#
# - pg_dump -Fc (custom format, nén sẵn) qua `docker exec`.
# - Đặt tên theo ngày giờ, giữ N bản gần nhất.
# - Đẩy lên object storage tương thích S3 (Cloudflare R2) nếu có cấu hình.
# - KHÔNG chứa secret: đọc credential từ biến môi trường (hoặc file ngoài
#   repo được source trước khi chạy).
#
# Biến môi trường:
#   POSTGRES_USER, POSTGRES_DB      (mặc định postgres / eyetracking)
#   PGPASSWORD                       (mật khẩu DB; bắt buộc nếu DB cần pass)
#   BACKUP_DIR                       (mặc định ./backups)
#   BACKUP_KEEP                      (số bản giữ lại, mặc định 7)
#   CONTAINER_NAME                   (mặc định eyetracking-postgres)
#   S3_ENDPOINT, S3_BUCKET, S3_PREFIX
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#   AWS_DEFAULT_REGION               (mặc định auto — R2 dùng "auto")
#
# Dùng:
#   ./ops/pg_backup.sh
# =====================================================================
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-eyetracking-postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-eyetracking}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"

log()  { printf '[pg_backup] %s\n' "$*"; }
die()  { printf '[pg_backup] ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "không tìm thấy docker"
docker inspect "$CONTAINER_NAME" >/dev/null 2>&1 \
  || die "không thấy container '$CONTAINER_NAME' (đang chạy?)"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/${POSTGRES_DB}_${STAMP}.dump"

log "dump $POSTGRES_DB từ container $CONTAINER_NAME → $FILE"
# -Fc: custom format (nén zlib), restore bằng pg_restore.
# Stream ra stdout của container rồi ghi vào host (không ghi trong container).
docker exec -e PGPASSWORD="${PGPASSWORD:-}" "$CONTAINER_NAME" \
  pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$FILE" \
  || die "pg_dump thất bại"

[ -s "$FILE" ] || die "file dump rỗng: $FILE"

GZ="$FILE.gz"
gzip -f "$FILE" || die "nén gzip thất bại"
FILE="$GZ"
log "đã nén: $FILE ($(du -h "$FILE" | cut -f1))"

# ---- Đẩy lên object storage (tùy chọn) ----
if [ -n "${S3_BUCKET:-}" ]; then
  command -v aws >/dev/null 2>&1 \
    || die "có S3_BUCKET nhưng thiếu awscli (cài awscli hoặc bỏ S3_BUCKET)"
  : "${S3_ENDPOINT:?cần S3_ENDPOINT khi đặt S3_BUCKET}"
  : "${AWS_ACCESS_KEY_ID:?thiếu AWS_ACCESS_KEY_ID}"
  : "${AWS_SECRET_ACCESS_KEY:?thiếu AWS_SECRET_ACCESS_KEY}"
  PREFIX="${S3_PREFIX:-pg}"
  KEY="${PREFIX%/}/$(basename "$FILE")"
  log "upload → s3://$S3_BUCKET/$KEY"
  aws --endpoint-url "$S3_ENDPOINT" s3 cp "$FILE" "s3://$S3_BUCKET/$KEY" \
    || die "upload lên object storage thất bại"
  log "upload xong"
else
  log "bỏ qua upload (chưa đặt S3_BUCKET)"
fi

# ---- Dọn bản cũ, giữ BACKUP_KEEP bản gần nhất ----
log "dọn bản cũ, giữ $BACKUP_KEEP bản gần nhất"
ls -1t "$BACKUP_DIR"/${POSTGRES_DB}_*.dump.gz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
  log "xóa $old"
  rm -f "$old"
done

log "hoàn tất: $FILE"
