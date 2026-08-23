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

export async function trainGazeSession(sessionId: string): Promise<TrainResult> {
  try {
    const res = await fetch(`/gaze/session/${sessionId}/train`, { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      mae_px?: number;
    };
    if (data.status === 'ok') return { ok: true, maePx: data.mae_px };
    if (data.status === 'insufficient_samples') return { ok: false, error: 'insufficient_samples' };
    return { ok: false, error: `train_${res.status}` };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

// Kiểm tra khuôn mặt nhanh (dùng session tạm): accepted = có mặt.
export async function checkFace(imageBlob: Blob): Promise<{ ok: boolean; error?: string }> {
  const session = await createGazeSession([{ id: 'check', x: 0.5, y: 0.5 }], 1280, 720);
  if (!session.ok || !session.sessionId) return { ok: false, error: 'network_error' };
  const r = await submitCalibrationSample(session.sessionId, imageBlob, 'check');
  if (r.status === 'accepted') return { ok: true };
  if (r.status === 'no_face') return { ok: false, error: 'no_face' };
  return { ok: false, error: r.status === 'invalid_image' ? 'invalid_image' : 'network_error' };
}

// Lưu session đã train để phiên học sau dùng stream (TTL server ~30 phút).
export function storeGazeSession(sessionId: string): void {
  globalThis.localStorage?.setItem(SESSION_KEY, sessionId);
  globalThis.localStorage?.setItem(CALIBRATED_AT_KEY, new Date().toISOString());
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
}

// WebSocket stream (nối thẳng AI service — không qua proxy, không cần CORS).
export const GAZE_WS_ORIGIN =
  process.env.NEXT_PUBLIC_EYE_TRACKING_WS_URL?.trim() || 'wss://api.nmhieu.online';

export function gazeStreamUrl(sessionId: string): string {
  return `${GAZE_WS_ORIGIN}/session/${sessionId}/stream`;
}