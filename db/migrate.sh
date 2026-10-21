#!/usr/bin/env bash
# =============================================================================
# migrate.sh — runner migration DÙNG CHUNG cho Docker (Dockerfile.migrations) và CI.
#
#   bash db/migrate.sh [THU_MUC_MIGRATION]     # mặc định: <dir của script>/migrations
#
# Cơ chế
#   * Bảng `schema_migrations` ghi lại file nào đã áp + checksum sha256.
#   * Chỉ chạy file CHƯA áp. File đã áp mà nội dung đổi -> DỪNG NGAY (không cho
#     sửa file đã ship; phải thêm file mới: 021_..., 022_...).
#   * pg_advisory_lock giữ suốt quá trình chạy -> chặn 2 deploy chạy song song.
#   * DB đã có schema nhưng chưa có bảng tracking (lần đầu bật cơ chế này, hoặc
#     DB cũ) -> chạy như cũ rồi mới ghi dấu. Vì mọi file đều idempotent nên an toàn.
#
# Biến môi trường (psql tự đọc): PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
#   CHATBOT_DATABASE_URL_DOCKER... không liên quan — chỉ dùng PG*.
#
# Chế độ đặc biệt
#   MIGRATE_BASELINE=1          ghi dấu checksum mà KHÔNG chạy file (dùng khi DB
#                               đã đồng bộ sẵn nhưng bảng tracking còn trống).
#                               KHÔNG dùng cho server đang thiếu migration.
#   MIGRATE_UPDATE_CHECKSUMS=1  chỉ ghi lại db/migrations.checksums.txt, không cần DB.
#   MIGRATE_NO_LOCK=1           bỏ advisory lock (dùng cho test/CI).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${1:-${SCRIPT_DIR}/migrations}"
CHECKSUMS_FILE="${SCRIPT_DIR}/migrations.checksums.txt"

if [ ! -d "${MIGRATIONS_DIR}" ]; then
    echo "LỖI: không thấy thư mục migration: ${MIGRATIONS_DIR}" >&2
    exit 1
fi

list_migrations() {
    find "${MIGRATIONS_DIR}" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort -V
}

checksum_of() { sha256sum "$1" | awk '{print $1}'; }

# ---------------------------------------------------------------------------
# Chế độ ghi lại checksums.txt (không cần DB)
# ---------------------------------------------------------------------------
if [ "${MIGRATE_UPDATE_CHECKSUMS:-0}" = "1" ]; then
    {
        echo "# Checksum sha256 của các file migration TẠI THỜI ĐIỂM ĐƯỢC CHỐT."
        echo "# CI đối chiếu file này (.github/workflows/ci.yml, job 'migrations') để"
        echo "# chặn việc sửa nội dung file migration đã ship."
        echo "#"
        echo "# Sinh lại:  MIGRATE_UPDATE_CHECKSUMS=1 bash db/migrate.sh"
        echo "# QUY TẮC: KHÔNG sửa file đã ship — hãy thêm file mới (021_..., 022_...)."
        echo "# (Sửa file + ghi lại file này là hành vi cố ý, sẽ lộ rõ trong review.)"
        echo "# <tên file> <sha256>"
        list_migrations | while read -r name; do
            printf '%s %s\n' "${name}" "$(checksum_of "${MIGRATIONS_DIR}/${name}")"
        done
    } > "${CHECKSUMS_FILE}"
    echo "Đã ghi ${CHECKSUMS_FILE} ($(grep -c '\.sql' "${CHECKSUMS_FILE}") file)."
    exit 0
fi

psql_t() { psql -v ON_ERROR_STOP=1 -q -tA "$@"; }

# psql -c KHÔNG nội suy biến (:'name'), nên escape và inline giá trị.
# Tên file luôn do runner sinh ra (NNN_*.sql) nhưng vẫn escape nháy đơn cho chắc.
sql_quote() { printf '%s' "${1//\'/\'\'}"; }

# ---------------------------------------------------------------------------
# Kết nối (chờ postgres sẵn sàng)
# ---------------------------------------------------------------------------
for attempt in $(seq 1 30); do
    if psql_t -c 'SELECT 1' >/dev/null 2>&1; then
        break
    fi
    if [ "${attempt}" -eq 30 ]; then
        echo "LỖI: không kết nối được PostgreSQL (PGHOST=${PGHOST:-localhost} PGUSER=${PGUSER:-<trống>} PGDATABASE=${PGDATABASE:-<trống>})." >&2
        exit 1
    fi
    sleep 2
done

echo "DB đích: $(psql_t -c "SELECT current_database() || ' @ ' || current_user")"

# ---------------------------------------------------------------------------
# Advisory lock — giữ session psql mở suốt quá trình chạy (fd 9)
# ---------------------------------------------------------------------------
LOCK_HELD=0
release_lock() {
    if [ "${LOCK_HELD}" = "1" ]; then
        printf "SELECT pg_advisory_unlock_all();\n" >&9 2>/dev/null || true
        exec 9>&-
        LOCK_HELD=0
    fi
}
trap release_lock EXIT

if [ "${MIGRATE_NO_LOCK:-0}" != "1" ]; then
    if exec 9> >(psql -v ON_ERROR_STOP=1 -q -o /dev/null 2>/dev/null); then
        if printf "SELECT pg_advisory_lock(hashtext('eyelearning_migrations'));\n" >&9 2>/dev/null; then
            LOCK_HELD=1
        else
            echo "CẢNH BÁO: không lấy được advisory lock — chạy tiếp không khoá." >&2
        fi
    else
        echo "CẢNH BÁO: không mở được session giữ lock — chạy tiếp không khoá." >&2
    fi
fi

# ---------------------------------------------------------------------------
# Bảng tracking
# ---------------------------------------------------------------------------
psql_t -c "CREATE TABLE IF NOT EXISTS schema_migrations (
             filename    TEXT PRIMARY KEY,
             checksum    TEXT NOT NULL,
             applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
             duration_ms INTEGER
           )" >/dev/null

# ---------------------------------------------------------------------------
# Vòng lặp
# ---------------------------------------------------------------------------
applied=0
skipped=0
baseline=0

for name in $(list_migrations); do
    path="${MIGRATIONS_DIR}/${name}"
    sum="$(checksum_of "${path}")"
    q_name="$(sql_quote "${name}")"
    existing="$(psql_t -c "SELECT checksum FROM schema_migrations WHERE filename = '${q_name}'")"

    if [ -n "${existing}" ] && [ "${existing}" = "${sum}" ]; then
        echo "=== ${name} — bỏ qua (đã áp) ==="
        skipped=$((skipped + 1))
        continue
    fi

    if [ -n "${existing}" ] && [ "${existing}" != "${sum}" ]; then
        echo "" >&2
        echo "LỖI: file migration đã áp nhưng nội dung đã bị SỬA: ${name}" >&2
        echo "      đã áp (checksum): ${existing}" >&2
        echo "      hiện tại        : ${sum}" >&2
        echo "      => KHÔNG sửa file đã ship. Hãy thêm file mới (vd 021_ten_moi.sql)" >&2
        echo "         để bù thay đổi, rồi deploy lại." >&2
        exit 1
    fi

    if [ "${MIGRATE_BASELINE:-0}" = "1" ]; then
        echo "=== ${name} — ghi dấu (baseline, KHÔNG chạy) ==="
        psql_t -c "INSERT INTO schema_migrations (filename, checksum) VALUES ('${q_name}', '${sum}')
                   ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()" >/dev/null
        baseline=$((baseline + 1))
        continue
    fi

    echo "=== ${name} — áp dụng ==="
    started_ms="$(date +%s%3N)"
    psql -v ON_ERROR_STOP=1 -q -f "${path}"
    duration_ms=$(( $(date +%s%3N) - started_ms ))

    psql_t -c "INSERT INTO schema_migrations (filename, checksum, duration_ms)
               VALUES ('${q_name}', '${sum}', ${duration_ms})
               ON CONFLICT (filename) DO UPDATE
                 SET checksum = EXCLUDED.checksum, applied_at = now(), duration_ms = EXCLUDED.duration_ms" >/dev/null
    applied=$((applied + 1))
done

echo "=> migration xong: ${applied} áp dụng, ${skipped} bỏ qua, ${baseline} baseline."
