// lib/api/calibration.ts — Calibration + gaze stream dùng protocol /session
// của AI service (image hieunm1501/gaze-api, uvicorn server:app trên cổng 8000).
//
// Protocol /session (stateful — server giữ model theo session):
//   POST /session                 {screen_width, screen_height, points:[{id,x,y}]}
//                                 -> { session_id }
//   POST /session/{sid}/calibrate (multipart: image + point_id)
//                                 -> { status: accepted|no_face|invalid_image|unknown_point, count }
//   POST /session/{sid}/train     -> { status: ok|insufficient_samples, mae_px }
//   WS   /session/{sid}/stream    -> binary JPEG -> { ok, x, y } | { ok:false, error }
//
// HTTP gọi qua đường /gaze/* (Next.js rewrite -> AI service) để tránh CORS;
// WebSocket nối thẳng (WS không bị chặn bởi CORS).

const SESSION_KEY = 'gaze_session_id';
const CALIBRATED_AT_KEY = 'gaze_calibrated_at';

export interface CalPoint {
  id: string;
  x: number; // chuẩn hóa [0,1]
  y: number;
}

const GRID = 4;
const MARGIN = 0.02; // cách mép 2% -> phủ kín viewport

// 16 điểm calibration (4×4) dùng chung cho luồng calibrate.
export function buildCalibrationPoints(): CalPoint[] {
  const pos = Array.from(
    { length: GRID },
    (_, i) => MARGIN + (i * (1 - 2 * MARGIN)) / (GRID - 1),
  );
  const points: CalPoint[] = [];
  let n = 0;
  for (const y of pos) {
    for (const x of pos) {
      points.push({ id: `p${n}`, x, y });
      n += 1;
    }
  }
  return points;
}

export interface SessionCreateResult {
  ok: boolean;
  sessionId?: string;
  error?: string;
}

export async function createGazeSession(
  points: CalPoint[],
  screenWidth: number,
  screenHeight: number,
): Promise<SessionCreateResult> {
  try {
    const res = await fetch('/gaze/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screen_width: screenWidth, screen_height: screenHeight, points }),
    });
    const data = (await res.json()) as { session_id?: string };
    if (data.session_id) return { ok: true, sessionId: data.session_id };
    return { ok: false, error: `session_${res.status}` };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

export interface SampleResult {
  ok: boolean;
  status?: string;
  count?: number;
  error?: string;
}

// Gửi 1 frame JPEG + point_id -> server tích lũy mẫu cho điểm đó (server-side).
export async function submitCalibrationSample(
  sessionId: string,
  imageBlob: Blob,
  pointId: string,
): Promise<SampleResult> {
  const form = new FormData();
  form.append('image', imageBlob, 'frame.jpg');
  form.append('point_id', pointId);
  try {
    const res = await fetch(`/gaze/session/${sessionId}/calibrate`, {
      method: 'POST',
      body: form,
    });
    const data = (await res.json()) as { status?: string; count?: number };
    return {
      ok: res.ok,
      status: data.status,
      count: data.count,
      error: res.ok ? undefined : `http_${res.status}`,
    };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

export interface TrainResult {
  ok: boolean;
  maePx?: number;
  error?: string;
}

/** Ngưỡng MAE train chấp nhận được (đơn vị chuẩn hóa [0,1]). VD 0.05 ≈ lệch 5% màn hình. */
export const MAX_TRAIN_MAE = 0.05;

export function formatMaePercent(mae: number): string {
  return `${(mae * 100).toFixed(1)}%`;
}

export async function trainGazeSession(sessionId: string): Promise<TrainResult> {
  try {
    const res = await fetch(`/gaze/session/${sessionId}/train`, { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      mae_px?: number;
    };
    // Luôn kèm mae_px khi server trả về — caller dùng để từ chối model kém
    // ngay cả khi status ok.
    if (data.status === 'ok') return { ok: true, maePx: data.mae_px };
    if (data.status === 'insufficient_samples') return { ok: false, error: 'insufficient_samples', maePx: data.mae_px };
    return { ok: false, error: `train_${res.status}`, maePx: data.mae_px };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

export interface SessionStatusResult {
  ok: boolean;
  /** true khi session tồn tại và đã train xong (stream được). */
  ready: boolean;
  error?: string;
}

// Kiểm tra session đã lưu còn sống và sẵn sàng stream không.
// Dùng ở cổng vào phiên học: session hết TTL 30' / bị xóa / chưa train
// đều coi như chưa hiệu chỉnh để bắt làm lại, tránh rơi vào mô phỏng.
export async function getGazeSessionStatus(sessionId: string): Promise<SessionStatusResult> {
  try {
    const res = await fetch(`/gaze/session/${encodeURIComponent(sessionId)}`);
    if (res.status === 404) return { ok: false, ready: false, error: 'not_found' };
    if (!res.ok) return { ok: false, ready: false, error: `http_${res.status}` };
    const data = (await res.json().catch(() => ({}))) as {
      state?: string;
      calibrated?: boolean;
    };
    const ready = data.state === 'ready' || data.calibrated === true;
    return { ok: true, ready };
  } catch {
    return { ok: false, ready: false, error: 'network_error' };
  }
}

// Xóa session phía server để không chạm trần 100 session (fire-and-forget).
export function deleteGazeSession(sessionId: string): void {
  try {
    void fetch(`/gaze/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {});
  } catch {
    // ignore
  }
}

// Kiểm tra khuôn mặt nhanh (dùng session tạm): accepted = có mặt.
// Session tạm được xóa ngay sau khi xong để không rò rỉ slot (trần 100 session).
export async function checkFace(imageBlob: Blob): Promise<{ ok: boolean; error?: string }> {
  const session = await createGazeSession([{ id: 'check', x: 0.5, y: 0.5 }], 1280, 720);
  if (!session.ok || !session.sessionId) return { ok: false, error: 'network_error' };
  try {
    const r = await submitCalibrationSample(session.sessionId, imageBlob, 'check');
    if (r.status === 'accepted') return { ok: true };
    if (r.status === 'no_face') return { ok: false, error: 'no_face' };
    return { ok: false, error: r.status === 'invalid_image' ? 'invalid_image' : 'network_error' };
  } finally {
    deleteGazeSession(session.sessionId);
  }
}

// Lưu session đã train để phiên học sau dùng stream (TTL server ~30 phút).
// Kèm kích thước viewport lúc hiệu chỉnh để phát hiện đổi màn hình/cửa sổ
// (model tuyến tính chỉ đúng với geometry lúc calibrate).
export function storeGazeSession(sessionId: string, screenWidth?: number, screenHeight?: number): void {
  globalThis.localStorage?.setItem(SESSION_KEY, sessionId);
  globalThis.localStorage?.setItem(CALIBRATED_AT_KEY, new Date().toISOString());
  if (screenWidth && screenHeight) {
    globalThis.localStorage?.setItem('gaze_screen_w', String(Math.round(screenWidth)));
    globalThis.localStorage?.setItem('gaze_screen_h', String(Math.round(screenHeight)));
  }
}

export function getStoredCalibrationScreen(): { w: number; h: number } | null {
  const w = Number(globalThis.localStorage?.getItem('gaze_screen_w') ?? '');
  const h = Number(globalThis.localStorage?.getItem('gaze_screen_h') ?? '');
  if (!w || !h) return null;
  return { w, h };
}

/** true khi viewport hiện tại lệch >10% so với lúc hiệu chỉnh → nên làm lại. */
export function isCalibrationScreenStale(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = getStoredCalibrationScreen();
  if (!stored) return false;
  const dw = Math.abs(window.innerWidth - stored.w) / stored.w;
  const dh = Math.abs(window.innerHeight - stored.h) / stored.h;
  return dw > 0.1 || dh > 0.1;
}

export function getStoredGazeSessionId(): string | null {
  return globalThis.localStorage?.getItem(SESSION_KEY) ?? null;
}

export function getStoredCalibration(): { calibrated: boolean; calibratedAt: string | null } {
  return {
    calibrated: Boolean(getStoredGazeSessionId()),
    calibratedAt: globalThis.localStorage?.getItem(CALIBRATED_AT_KEY) ?? null,
  };
}

export function clearStoredGazeSession(): void {
  globalThis.localStorage?.removeItem(SESSION_KEY);
  globalThis.localStorage?.removeItem(CALIBRATED_AT_KEY);
  globalThis.localStorage?.removeItem('gaze_screen_w');
  globalThis.localStorage?.removeItem('gaze_screen_h');
}

// WebSocket stream (nối thẳng AI service — không qua proxy, không cần CORS).
// Production phải dùng wss:// (TLS). Suy ra từ NEXT_PUBLIC_GAZE_URL:
//   https://... -> wss://..., http://... -> ws://
// Tự động nâng lên wss:// nếu trang đang chạy trên https: (tránh Mixed Content).
function getGazeWsOrigin(): string {
  // Hỗ trợ cả biến cũ NEXT_PUBLIC_EYE_TRACKING_WS_URL (đã set dạng ws(s)://)
  const raw = (
    process.env.NEXT_PUBLIC_GAZE_URL?.trim() ||
    (process.env as Record<string, string | undefined>).NEXT_PUBLIC_EYE_TRACKING_WS_URL?.trim() ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");

  let origin: string;
  if (/^wss?:\/\//i.test(raw)) {
    origin = raw;
  } else if (/^https:\/\//i.test(raw)) {
    origin = raw.replace(/^https:/i, "wss:");
  } else if (/^http:\/\//i.test(raw)) {
    origin = raw.replace(/^http:/i, "ws:");
  } else {
    // Bare host (vd: gaze.eyelearning.id.vn) — suy ra scheme theo page protocol
    const isHttps =
      typeof window !== "undefined"
        ? window.location.protocol === "https:"
        : raw.includes("eyelearning.id.vn") || raw.includes("api.nmhieu.online");
    origin = `${isHttps ? "wss" : "ws"}://${raw.replace(/^\/+/, "")}`;
  }

  // Enforce wss khi page là https (browser chặn ws trên https)
  if (typeof window !== "undefined" && window.location.protocol === "https:" && origin.startsWith("ws://")) {
    origin = origin.replace(/^ws:/, "wss:");
  }
  return origin;
}

export const GAZE_WS_ORIGIN = getGazeWsOrigin();

export function gazeStreamUrl(sessionId: string): string {
  return `${getGazeWsOrigin()}/session/${sessionId}/stream`;
}