// lib/api/calibration.ts — Calibration + gaze stream (khớp AI service thật, image
// hieunm1501/gaze-api — API/server.py phiên bản đang chạy trong Docker).
//
// Giao thức AI service (khác hẳn với API/README.md — README mô tả protocol
// /session KHÔNG BAO GIỜ được xây dựng):
//   POST /calibrate/point   (multipart: image JPEG + x, y chuẩn hóa [0,1])
//                           -> { ok: true, sample: [pitch,yaw,rvec(3),tvec(3),x,y] }
//                              | { ok: false, error: no_face|invalid_image } (hoặc 503)
//   POST /calibrate/fit     (JSON: { samples: [[10 số] x 16-25] })
//                           -> { ok: true, params: [6 số] }  (10 số mẫu, 6 số tham số)
//   WS  /infer              -> message text đầu tiên {"params":[6],"smooth":true}
//                              rồi binary JPEG -> {ok,x,y} / {ok:false,error}
//
// Client giữ mẫu (16-25 dòng × 10 số) tự tích lũy, gọi /calibrate/fit khi đủ,
// nhận 6 tham số và lưu LÊN BACKEND (POST /api/calibrations, JSON). Lần stream
// sau chỉ cần tải 6 tham số đó rồi gửi vào WS /infer — không cần session,
// không cần calibration lại.
//
// KHÔNG còn chế độ "mock giả 80 mẫu": lỗi mạng trả về network_error để UI báo
// rõ, thay vì tự bịa dữ liệu.

import { apiFetch, API_BASE_URL } from './client';
import { getDeviceFingerprint } from './student';

// AI service HTTP base (Docker expose cổng 9000).
export const AI_BASE_URL =
  process.env.NEXT_PUBLIC_EYE_TRACKING_HTTP_URL?.trim() || 'http://localhost:9000';

const MIN_POINTS = 16;
const MAX_POINTS = 25;
const SAMPLE_SIZE = 10;
const PARAMS_SIZE = 6;

export interface CalPoint {
  id: string;
  x: number; // chuẩn hóa [0,1]
  y: number;
}

const GRID = 4;
const MARGIN = 0.02; // cách mép 2% → phủ kín viewport

// 16 điểm calibration dùng chung cho cả luồng calibrate lẫn luồng stream.
export function buildCalibrationPoints(): CalPoint[] {
  const pos = Array.from(
    { length: GRID },
    (_, i) => MARGIN + (i * (1 - 2 * MARGIN)) / (GRID - 1),
  );
  const pts: CalPoint[] = [];
  let n = 0;
  for (const y of pos) {
    for (const x of pos) pts.push({ id: `p${n}`, x, y });
    n += 1;
  }
  return pts;
}

export interface RegisterPointResult {
  ok: boolean;
  sample?: number[];
  error?: string;
}

export interface FitResult {
  ok: boolean;
  params?: number[];
  error?: string;
}

// Gửi 1 frame JPEG + tọa độ [0,1] → server trả 1 mẫu 10 số để client tích lũy.
// Mẫu này KHÔNG được lưu phía server — client phải tự gom rồi gọi fitCalibration.
export async function registerCalibrationPoint(
  imageBlob: Blob | null,
  x: number,
  y: number,
): Promise<RegisterPointResult> {
  if (!imageBlob) return { ok: false, error: 'no_camera' };

  const form = new FormData();
  form.append('image', imageBlob, 'frame.jpg');
  form.append('x', String(x));
  form.append('y', String(y));

  let res: Response;
  try {
    res = await fetch(`${AI_BASE_URL}/calibrate/point`, {
      method: 'POST',
      body: form,
    });
  } catch {
    return { ok: false, error: 'network_error' };
  }

  try {
    const data = (await res.json()) as {
      ok?: boolean;
      sample?: number[];
      error?: string;
    };
    if (data.ok && Array.isArray(data.sample) && data.sample.length === SAMPLE_SIZE) {
      return { ok: true, sample: data.sample };
    }
    return { ok: false, error: data.error ?? `http_${res.status}` };
  } catch {
    return { ok: false, error: 'invalid_response' };
  }
}

// Fit bộ hiệu chỉnh từ 16-25 mẫu (mỗi mẫu 10 số) → trả 6 tham số [a1,a2,b1,a3,a4,b2].
export async function fitCalibration(samples: number[][]): Promise<FitResult> {
  if (samples.length < MIN_POINTS) {
    return { ok: false, error: `insufficient_samples_min_${MIN_POINTS}` };
  }
  if (samples.length > MAX_POINTS) {
    return { ok: false, error: `too_many_samples_max_${MAX_POINTS}` };
  }

  let res: Response;
  try {
    res = await fetch(`${AI_BASE_URL}/calibrate/fit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples }),
    });
  } catch {
    return { ok: false, error: 'network_error' };
  }

  try {
    const data = (await res.json()) as {
      ok?: boolean;
      params?: number[];
      error?: string;
    };
    if (data.ok && Array.isArray(data.params) && data.params.length === PARAMS_SIZE) {
      return { ok: true, params: data.params };
    }
    return { ok: false, error: data.error ?? `http_${res.status}` };
  } catch {
    return { ok: false, error: 'invalid_response' };
  }
}

// Lưu 6 tham số lên backend làm calibration active cho (user, device).
// POST /api/calibrations (JSON)
export async function saveCalibrationParams(
  params: number[],
  numPoints: number,
  maePx: number | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch('/api/calibrations', {
      method: 'POST',
      body: {
        deviceFingerprint: getDeviceFingerprint(),
        numPoints,
        params,
        maePx,
        mappingModelVersion: 'v2',
        screenWidthPx: typeof window !== 'undefined' ? window.screen?.width : undefined,
        screenHeightPx: typeof window !== 'undefined' ? window.screen?.height : undefined,
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'save_failed' };
  }
}

export interface ActiveCalibration {
  calibrated: boolean;
  maePx: number | null;
  mappingModelVersion: string;
  calibratedAt: string;
}

// GET /api/calibrations/active — metadata bản active (404 => null).
export async function fetchActiveCalibration(): Promise<ActiveCalibration | null> {
  try {
    const url = new URL('/api/calibrations/active', API_BASE_URL);
    url.searchParams.set('deviceFingerprint', getDeviceFingerprint());
    const res = await fetch(url, {
      headers: authHeaders(),
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as ActiveCalibration;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const token =
    typeof globalThis !== 'undefined'
      ? (globalThis.localStorage?.getItem('auth_token') ?? null)
      : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// GET /api/calibrations/active/params — 6 tham số active để gửi vào WS /infer.
export async function fetchActiveParams(): Promise<number[] | null> {
  try {
    const data = await apiFetch<{ params: number[] }>(
      '/api/calibrations/active/params',
      { params: { deviceFingerprint: getDeviceFingerprint() } },
    );
    if (!Array.isArray(data.params) || data.params.length !== PARAMS_SIZE) return null;
    return data.params;
  } catch {
    return null;
  }
}