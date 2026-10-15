#!/usr/bin/env bash
# =====================================================================
# pg_restore_test.sh — kiểm thử khôi phục bản dump gần nhất vào Postgres tạm
#
# Xác nhận bản backup dùng được: tạo container Postgres tạm (khác cái prod),
# restore bản dump mới nhất, in số dòng vài bảng chính, rồi xóa container tạm.
#
# Biến môi trường:
#   BACKUP_DIR        (mặc định ./backups)
#   POSTGRES_DB       (mặc định eyetracking)
#   POSTGRES_USER     (mặc định postgres)
#   PGPASSWORD        (mật khẩu DB gốc — chỉ để tham chiếu, không bắt buộc)
#   PG_IMAGE          (mặc định pgvector/pgvector:pg16)
#   TEST_CONTAINER    (mặc định eyetracking-pgrestore-test)
#
# Dùng:
#   ./ops/pg_restore_test.sh
# =====================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
POSTGRES_DB="${POSTGRES_DB:-eyetracking}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
PG_IMAGE="${PG_IMAGE:-pgvector/pgvector:pg16}"
TEST_CONTAINER="${TEST_CONTAINER:-eyetracking-pgrestore-test}"
RESTORE_PASS="restore_test_pw"

log() { printf '[pg_restore_test] %s\n' "$*"; }
die() { printf '[pg_restore_test] ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "không tìm thấy docker"

LATEST="$(ls -1t "$BACKUP_DIR"/${POSTGRES_DB}_*.dump.gz 2>/dev/null | head -n1 || true)"
[ -n "$LATEST" ] || die "không có bản dump nào trong $BACKUP_DIR"
log "dùng bản mới nhất: $LATEST"

cleanup() {
  log "dọn container tạm $TEST_CONTAINER"
  docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Xóa container tạm cũ nếu còn sót (không dùng volume → không đụng dữ liệu thật).
docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true

log "khởi động Postgres tạm ($PG_IMAGE)"
docker run -d --name "$TEST_CONTAINER" \
  -e POSTGRES_USER="$POSTGRES_USER" \
  -e POSTGRES_PASSWORD="$RESTORE_PASS" \
  -e POSTGRES_DB="$POSTGRES_DB" \
  "$PG_IMAGE" >/dev/null

log "chờ Postgres tạm sẵn sàng..."
for _ in $(seq 1 30); do
  if docker exec "$TEST_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec "$TEST_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 \
  || die "Postgres tạm không lên"

log "giải nén + restore"
TMP_DUMP="$(mktemp)"
gunzip -c "$LATEST" > "$TMP_DUMP"

# Dynamic-ish schema của app + pgvector: restore với --clean --if-exists.
docker exec -i -e PGPASSWORD="$RESTORE_PASS" "$TEST_CONTAINER" \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --if-exists --clean \
  < "$TMP_DUMP" || die "pg_restore thất bại"
rm -f "$TMP_DUMP"
log "restore xong"

log "đếm số dòng vài bảng chính:"
docker exec -e PGPASSWORD="$RESTORE_PASS" "$TEST_CONTAINER" \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    SELECT 'users' AS tbl, count(*) FROM users
    UNION ALL SELECT 'roles', count(*) FROM roles
    UNION ALL SELECT 'courses', count(*) FROM courses
    UNION ALL SELECT 'enrollments', count(*) FROM enrollments
    UNION ALL SELECT 'lessons', count(*) FROM lessons
    ORDER BY tbl;"

log "OK — bản dump restore được."
