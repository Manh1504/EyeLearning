# Hướng dẫn thiết lập CI/CD — EyeLearning

Pipeline tự động: GitHub Actions test + build + push ảnh lên GitHub Container Registry (GHCR),
sau đó gọi **Portainer stack webhook** để Portainer tự `git pull` + `docker compose up -d`
(tự pull ảnh mới nhờ `pull_policy: always`).

```
push/PR ─► ci.yml                    : test backend (pytest + postgres) + lint/build frontend
CI main thành công ─► build.yml      : build 4 ảnh → push GHCR → POST Portainer webhook
push tag / chạy thủ công ─► build.yml: build ảnh, không tự redeploy Portainer
frontend ─► Vercel         : tự build & deploy (tách riêng, không build image)
```

> Namespace ảnh: `ghcr.io/manh1504/eyelearning-{backend,nginx,migrations,gaze}`
> (viết thường). Nếu GitHub owner khác, sửa `manh1504` trong `.github/workflows/build.yml`
> và `docker-compose.yml`.

---

## A. Thiết lập trên GitHub

### A1. Push ảnh (CI)
`build.yml` đã khai báo `permissions: packages: write`, dùng `GITHUB_TOKEN` có sẵn — **không cần PAT cho CI**.

### A2. Để package GHCR public (1 lần, sau lần build đầu tiên)
Repo public **không** tự làm package public — package GHCR mặc định vẫn **private**.
Sau khi CI chạy thành công lần đầu (4 package xuất hiện):
1. `GitHub → profile → Packages → eyelearning-backend → Package settings → Danger Zone → Change visibility → Public`.
2. Làm tương tự cho `eyelearning-nginx`, `eyelearning-migrations` và `eyelearning-gaze`.

Sau khi public, server pull không cần đăng nhập, không cần PAT, không cần registry.

### A3. Khai báo Secret cho webhook
`Repo → Settings → Secrets and variables → Actions → New repository secret`:

| Tên | Giá trị |
|---|---|
| `PORTAINER_WEBHOOK_URL` | webhook URL của stack (lấy ở B2), dạng `https://<host>:9443/api/stacks/webhooks/<id>` |

---

## B. Thiết lập trên Portainer

### B1. Stack phải tạo từ Git (để có webhook)
Webhook chỉ có trên stack tạo từ **Repository**. Nếu stack cũ là web-editor, tạo stack mới:
1. `Stacks → Add stack → Repository`.
2. Repository URL = GitHub repo, Reference = `refs/heads/main`.
3. Compose path = `docker-compose.yml`.
4. Environment variables = copy nguyên từ stack cũ (JWT_SECRET, POSTGRES_*, CLOUDFLARE_TUNNEL_TOKEN...).
5. Cài đặt `Automatic updates` nếu muốn poll thêm; không bắt buộc khi đã có webhook.

> `docker-compose.yml` trong repo đã trỏ sẵn sang `ghcr.io/manh1504/...`, nên stack Git sẽ dùng đúng ảnh mới. Env được lưu trong Portainer, webhook không làm mất env.

### B2. Lấy Webhook URL
`Stacks → chọn stack → Webhooks → Copy URL` (dạng `.../api/stacks/webhooks/<id>`).
Dán vào secret `PORTAINER_WEBHOOK_URL` ở A3.

---

## C. Thiết lập Vercel (frontend)

1. `vercel.com → Add New → Project → Import repo EyeLearning`.
2. **Root Directory** = `frontend`.
3. Framework tự detect là **Next.js**.
4. Environment Variables (Production + Preview):
   - `NEXT_PUBLIC_API_URL` = `https://api.eyelearning.id.vn`
   - `NEXT_PUBLIC_GAZE_URL` = `https://gaze.eyelearning.id.vn`
   (khớp `frontend/next.config.ts` + `frontend/lib/api/calibration.ts`)

Vercel tự rebuild khi push `main`/PR — không cần config thêm trong repo.

---

## D. Vận hành

1. Push/merge vào `main`:
   - `ci.yml`: test backend + lint/build frontend.
   - Khi CI thành công, `build.yml` build `backend` + `nginx` + `migrations` + `gaze`, push GHCR (`latest` + `sha-<short>`), rồi `POST` webhook
     → Portainer `git pull` + `up -d` (pull ảnh mới nhờ `pull_policy: always`).
   - Vercel tự rebuild frontend.
2. Pin version/rollback: trong `docker-compose.yml` đổi tag `latest` → `sha-<short>` rồi redeploy;
   các ảnh `sha-<short>` vẫn còn trên GHCR.

### Migration DB
Migrations chạy **tự động** mỗi lần deploy qua service `migrate` (image
`ghcr.io/manh1504/eyelearning-migrations`) — idempotent nên chạy lại an toàn, backend chỉ khởi động
sau khi `migrate` hoàn thành (`depends_on: service_completed_successfully`). Không dùng bind mount
`./db/migrations` nữa vì Portainer deploy từ Git/web-editor không mount được đường dẫn tương đối.

Chạy migration thủ công khi cần:
```bash
docker compose up -d migrate
```
Nhớ bảo trì partition gaze hằng tháng bằng `db/maintain_partitions.sql` (cron).

---

## E. Xử lý lỗi thường gặp

| Triệu chứng | Nguyên nhân / fix |
|---|---|
| Build push GHCR bị `denied` | Bỏ sót `permissions: packages: write` hoặc tên owner sai; kiểm tra viết thường |
| Server không pull được ảnh | Package GHCR chưa public (làm A2) |
| Webhook fail 4xx/404 | URL sai; stack chưa phải loại Git (làm B1); secret sai |
| Webhook chạy nhưng ảnh không mới | Bỏ `pull_policy: always` trong compose; hoặc tag khác `latest` |
| `nginx` trả 444 khi mở `/` | Đúng thiết kế: `app.conf` chỉ nhận host `api.`/`gaze.`, host khác trả 444. Truy cập qua đúng domain |
