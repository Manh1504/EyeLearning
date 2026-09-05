'use client';

// components/student/calibration.tsx — Hiệu chỉnh mắt (16 điểm, 5 mẫu/điểm).
//
// Luồng (khớp AI service /session — server giữ model theo session):
//   1. Tạo session POST /session (16 điểm chuẩn hóa [0,1]) → session_id.
//   2. Hiển thị từng chấm; người dùng nhìn vào chấm → BẤM → chụp nhiều frame gửi
//      POST /session/{sid}/calibrate (image + point_id) — server tự gom mẫu.
//   3. Đủ 5 mẫu × 16 điểm → POST /session/{sid}/train → model sẵn sàng.
//   4. Pass (MAE ≤ ngưỡng) → vào thẳng bài học; không pass → hiệu chỉnh lại.
//   5. Lưu session_id vào localStorage để phiên học sau mở WS /session/{sid}/stream.
//
// no_face/invalid_image/network_error → báo bấm lại ở cùng chấm.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  buildCalibrationPoints,
  clearStoredGazeSession,
  createGazeSession,
  formatMaePercent,
  MAX_TRAIN_MAE,
  storeGazeSession,
  submitCalibrationSample,
  trainGazeSession,
  type CalPoint,
} from '@/lib/api/calibration';

const SAMPLES_PER_POINT = 5;       // server yêu cầu tối thiểu MIN_SAMPLES=5/điểm
const MAX_CAPTURES_PER_POINT = 10; // giới hạn số frame chụp lại mỗi điểm
const CAPTURE_GAP_MS = 100;        // burst nhanh để mắt chưa kịp rời chấm

type Phase = 'calibrating' | 'sending' | 'training';

const ERROR_TEXT: Record<string, string> = {
  no_face: 'Không phát hiện khuôn mặt — hãy nhìn thẳng vào chấm đỏ rồi bấm lại.',
  invalid_image: 'Ảnh webcam không hợp lệ — bấm lại.',
  no_camera: 'Camera không khả dụng — hãy cho phép camera rồi tải lại trang.',
  network_error: 'Không kết nối được dịch vụ AI — kiểm tra container gaze-api rồi bấm lại.',
  insufficient: 'Chưa đủ mẫu cho điểm này — hãy bấm lại và giữ nhìn vào chấm.',
};

export default function Calibration() {
  const params = useParams();
  const router = useRouter();
  const courseId = String(params?.courseId ?? 'c1');

  const points = useMemo<CalPoint[]>(() => buildCalibrationPoints(), []);
  const total = points.length;

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('calibrating');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionNonce, setSessionNonce] = useState(0);

  // Camera preview (ảnh thu nhỏ, đặt trong card mờ giữa màn hình — không chiếm đất vùng chấm).
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);

  // Tạo session gaze ngay khi mount (server giữ mẫu theo session này).
  // sessionNonce để tạo lại session mới khi hiệu chỉnh lại (model cũ đã kém thì bỏ hẳn).
  useEffect(() => {
    let cancelled = false;
    const screenWidth = typeof window !== 'undefined' ? (window.innerWidth || 1280) : 1280;
    const screenHeight = typeof window !== 'undefined' ? (window.innerHeight || 720) : 720;
    createGazeSession(points, screenWidth, screenHeight)
      .then((res) => {
        if (!cancelled && res.ok && res.sessionId) setSessionId(res.sessionId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [points, sessionNonce]);

  // Làm lại từ đầu với session mới (khi train fail / MAE quá cao).
  const resetCalibration = useCallback(() => {
    clearStoredGazeSession();
    setSessionId(null);
    setError(null);
    setIdx(0);
    setPhase('calibrating');
    setSessionNonce((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setCamOn(true);
      })
      .catch(() => setCamOn(false));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video) return null;
    // Chờ video có frame đầu tiên (mount sau khi camOn=true; srcObject gán qua ref-callback).
    let waited = 0;
    while (video.videoWidth === 0 && waited < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waited += 50;
    }
    if (video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? null), 'image/jpeg', 0.9));
  }, []);

  const goToCourse = useCallback(() => {
    router.replace(`/student/courses/${courseId}`);
  }, [courseId, router]);

  const finish = useCallback(async () => {
    if (!sessionId) return;
    setPhase('training');
    const trained = await trainGazeSession(sessionId);
    const maeLabel = trained.maePx != null ? formatMaePercent(trained.maePx) : null;

    const failed = !trained.ok || (trained.maePx != null && trained.maePx > MAX_TRAIN_MAE);
    if (failed) {
      const message = !trained.ok
        ? trained.error === 'insufficient_samples'
          ? ERROR_TEXT.insufficient
          : trained.error === 'network_error'
            ? 'Không kết nối được dịch vụ AI khi huấn luyện — hãy hiệu chỉnh lại.'
            : 'Không huấn luyện được bộ hiệu chỉnh — hãy hiệu chỉnh lại.'
        : `Độ chính xác hiệu chỉnh thấp (lệch trung bình ~${maeLabel} màn hình, cho phép ${formatMaePercent(MAX_TRAIN_MAE)}). Hãy hiệu chỉnh lại và giữ mắt nhìn chằm chằm vào từng chấm đỏ.`;
      console.log('[calibration] FAIL', {
        error: trained.error ?? null,
        maePx: trained.maePx ?? null,
        maePct: maeLabel,
        max: MAX_TRAIN_MAE,
      });
      resetCalibration();
      setError(message);
      return;
    }

    console.log('[calibration] PASS', { maePx: trained.maePx ?? null, maePct: maeLabel });
    storeGazeSession(sessionId, window.innerWidth, window.innerHeight);
    goToCourse();
  }, [sessionId, resetCalibration, goToCourse]);

  const handleDotClick = async () => {
    if (phase !== 'calibrating') return;
    if (!sessionId) {
      setError('Dịch vụ AI chưa sẵn sàng — hãy thử lại sau một nhịp.');
      return;
    }
    setPhase('sending');
    setError(null);
    // Chụp frame NGAY khi bấm (không delay): mắt rời chấm chỉ sau ~200-300ms,
    // delay cũ khiến mẫu train bị sai target có hệ thống → lệch đều.

    if (!camOn) {
      setPhase('calibrating');
      setError(ERROR_TEXT['no_camera']);
      return;
    }

    const point = points[idx];
    let accepted = 0;
    let failed: string | null = null;

    for (let attempt = 0; attempt < MAX_CAPTURES_PER_POINT && accepted < SAMPLES_PER_POINT; attempt++) {
      const frame = await captureFrame();
      if (frame === null) {
        failed = 'no_camera';
        break;
      }
      const result = await submitCalibrationSample(sessionId, frame, point.id);
      if (result.status === 'accepted') {
        accepted += 1;
      } else if (result.status === 'no_face' || result.status === 'invalid_image') {
        failed = result.status;
        break;
      } else {
        failed = 'network_error';
        break;
      }
      if (accepted < SAMPLES_PER_POINT) {
        await new Promise((r) => setTimeout(r, CAPTURE_GAP_MS));
      }
    }

    if (accepted < SAMPLES_PER_POINT) {
      setPhase('calibrating');
      setError(failed ? (ERROR_TEXT[failed] ?? 'Gửi điểm thất bại — bấm lại.') : ERROR_TEXT.insufficient);
      return;
    }

    if (idx === total - 1) {
      await finish();
      return;
    }
    setIdx(idx + 1);
    setPhase('calibrating');
  };

  const current = points[idx];
  const step = idx;
  const busy = phase !== 'calibrating';
  const progress = ((step + (phase === 'training' ? 1 : 0)) / total) * 100;

  return (
    <div className="relative h-dvh overflow-hidden bg-muted text-foreground font-sans antialiased">
      {/* Chấm đỏ hiện tại — chỉ 1 chấm một lúc; ẩn khi đang training */}
      {(phase === 'calibrating' || phase === 'sending') && (
        <button
          onClick={handleDotClick}
          disabled={busy}
          aria-label={`Điểm hiệu chỉnh ${step + 1}/${total}`}
          className="group absolute z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none disabled:cursor-default"
          style={{ left: `${current.x * 100}%`, top: `${current.y * 100}%` }}
        >
          <span className="absolute inset-0 rounded-full bg-destructive/20 transition group-hover:bg-destructive/30" />
          <span className={`absolute inset-2 rounded-full bg-destructive/40 transition ${busy ? 'animate-pulse' : ''}`} />
          <span className={`relative h-5 w-5 rounded-full border-2 border-white bg-destructive shadow-lg transition ${busy ? 'animate-pulse' : 'group-hover:scale-110'}`} />
        </button>
      )}

      {/* Thông báo OVERLAY MỜ giữa màn hình — không chiếm đất, không chặn bấm chấm.
          pointer-events-none ở container → bấm xuyên qua tới chấm đỏ. bg mờ + blur → chấm phía sau vẫn nhìn thấy. */}
      <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
        <div className="pointer-events-none w-full max-w-xs rounded-xl border border-border bg-card px-5 py-4 text-center shadow-lg">
          <p className="text-sm font-bold text-foreground">Hiệu chỉnh mắt</p>

          {phase === 'training' ? (
            <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Đang huấn luyện bộ hiệu chỉnh…
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Nhìn chằm chằm vào chấm đỏ rồi <span className="font-semibold text-foreground">bấm vào chấm và GIỮ mắt nhìn chấm</span> tới khi chấm tiếp theo hiện ra. Nhìn đi chỗ khác lúc này sẽ làm lệch toàn bộ kết quả.
            </p>
          )}

          {/* Tiến độ */}
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand-cyan transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">{Math.min(step + 1, total)}/{total}</span>
          </div>

          {error && (
            <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">{error}</p>
          )}

          <div className="mt-3 flex items-center justify-center gap-2">
            {/* Camera preview nhỏ */}
            {camOn && (
              <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-brand-dark">
                <video
                  ref={(el) => {
                    videoRef.current = el;
                    if (el && streamRef.current && !el.srcObject) {
                      el.srcObject = streamRef.current;
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full scale-x-[-1] object-cover"
                />
                <span className="absolute right-1 top-1 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}