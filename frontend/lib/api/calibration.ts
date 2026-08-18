// lib/api/calibration.ts — API calibration (khớp API/server.py).
//
// Endpoint:
//   POST /calibrate/point  (multipart: image JPEG + x, y chuẩn hóa [0,1])
//     → { ok: true, sample: [pitch, yaw, rvec(3), tvec(3), x, y] }  (10 số)
//     → { ok: false, error: "no_face" | "invalid_image" | "pipeline_not_ready" }
//   POST /calibrate/fit    (JSON: { samples: number[16..25][] × 10 })
//     → { ok: true, params: [a1, a2, b1, a3, a4, b2] }              (6 số)
//     → { ok: false, error: "mapping_model_not_ready" | "expected 16-25 samples" }
//
// CHẾ ĐỘ DEMO: khi backend chưa chạy (network_error) hoặc không có camera,
// trả mock ok để luồng demo vẫn đi tiếp. Khi nối backend thật, các nhánh
// mock chỉ xuất hiện khi backend thật sự không phản hồi — còn lỗi nghiệp vụ
// (no_face...) vẫn được trả về nguyên trạng để UI báo người dùng bấm lại.

import { API_BASE_URL, apiFetch } from './client';
import { getDeviceFingerprint } from './student';

export interface CalibrationPointResult {
  ok: boolean;
  error?: string;
  sample?: number[]; // 10 số
}

export interface FitCalibrationResult {
  ok: boolean;
  error?: string;
  params?: number[]; // 6 số
}

// Mẫu giả: chỉ có x, y thật; các giá trị còn lại = 0 (pitch/yaw/rvec/tvec).
const mockSample = (x: number, y: number) => [0, 0, 0, 0, 0, 0, 0, 0, x, y];
const MOCK_PARAMS = [0, 0, 0, 0, 0, 0];

export async function submitCalibrationPoint(
  imageBlob: Blob | null,
  x: number, // chuẩn hóa [0,1]
  y: number, // chuẩn hóa [0,1]
): Promise<CalibrationPointResult> {
  // Không có camera (từ chối quyền / thiết bị thiếu) → mock để demo chạy.
  if (!imageBlob) return { ok: true, sample: mockSample(x, y) };

  const form = new FormData();
  form.append('image', imageBlob, 'frame.jpg');
  form.append('x', String(x));
  form.append('y', String(y));

  try {
    const res = await fetch(`${API_BASE_URL}/calibrate/point`, { method: 'POST', body: form });
    return (await res.json()) as CalibrationPointResult;
  } catch {
    // Backend chưa chạy → mock, giữ demo đi tiếp.
    return { ok: true, sample: mockSample(x, y) };
  }
}

export async function fitCalibration(samples: number[][]): Promise<FitCalibrationResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/calibrate/fit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples }),
    });
    return (await res.json()) as FitCalibrationResult;
  } catch {
    return { ok: true, params: MOCK_PARAMS };
  }
}

// Lưu bộ tham số calibration lên backend để phiên học dùng.
// POST /api/calibrations { deviceFingerprint, screenWidthPx, screenHeightPx, numPoints, params }
export async function saveCalibration(
  params: number[],
  numPoints: number,
): Promise<{ ok: boolean }> {
  try {
    await apiFetch('/api/calibrations', {
      method: 'POST',
      body: {
        deviceFingerprint: getDeviceFingerprint(),
        screenWidthPx: window.screen?.width,
        screenHeightPx: window.screen?.height,
        numPoints,
        params,
        mappingModelVersion: 'v1',
      },
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
