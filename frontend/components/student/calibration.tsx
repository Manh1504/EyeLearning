'use client';

// components/student/calibration.tsx — Hiệu chỉnh mắt (16 điểm, phủ kín viewport).
//
// Luồng:
//   1. 16 chấm đỏ 4×4 trải đều, cách mép/góc chỉ 2% → sát viền, phủ kín viewport,
//      MỖI LẦN CHỈ 1 CHẤM.
//   2. Thông báo/hướng dẫn là OVERLAY MỜ đặt giữa màn hình (bg-white/55 + backdrop-blur),
//      không chiếm đất nào của vùng chấm; card này pointer-events-none nên bấm xuyên qua
//      được (chỉ nút "Làm sau" là bấm được). Chấm ở giữa vẫn thấy xuyên qua lớp mờ.
//   3. Người dùng nhìn vào chấm → BẤM → chụp frame webcam, gửi POST /calibrate/point
//      (image + x, y chuẩn hóa [0,1]). Chỉ khi { ok: true } (hoặc mock demo) mới hiện
//      chấm tiếp theo; lỗi nghiệp vụ (no_face...) báo lại để bấm lại cùng chấm.
//   4. Đủ 16 mẫu → POST /calibrate/fit → lưu params (6 số) vào localStorage →
//      chuyển sang course-learning.
//
// Chưa cần backend: lib/api/calibration.ts tự fallback mock khi backend không phản hồi
// hoặc không có camera, nên trang chạy demo được ngay.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { submitCalibrationPoint, fitCalibration, saveCalibration } from '@/lib/api/calibration';

const GRID = 4;        // 4×4 = 16 điểm
const MARGIN = 2;      // % cách mép/góc viewport → sát viền, phủ kín
const POINTS = 16;

type Phase = 'calibrating' | 'sending' | 'fitting';

interface CalPoint { x: number; y: number } // % viewport

function buildPoints(): CalPoint[] {
  const pos = Array.from(
    { length: GRID },
    (_, i) => MARGIN + (i * (100 - 2 * MARGIN)) / (GRID - 1),
  );
  const pts: CalPoint[] = [];
  for (const y of pos) for (const x of pos) pts.push({ x, y });
  return pts;
}

const ERROR_TEXT: Record<string, string> = {
  no_face: 'Không phát hiện khuôn mặt — hãy nhìn thẳng vào chấm đỏ và bấm lại.',
  invalid_image: 'Ảnh webcam không hợp lệ — bấm lại.',
  pipeline_not_ready: 'Máy chưa sẵn sàng (pipeline đang khởi động) — bấm lại sau vài giây.',
};

export default function Calibration() {
  const params = useParams();
  const router = useRouter();
  const courseId = String(params?.courseId ?? 'c1');

  const points = useMemo(() => buildPoints(), []);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('calibrating');
  const [error, setError] = useState<string | null>(null);

  // Camera preview (ảnh thu nhỏ, đặt trong card mờ giữa màn hình — không chiếm đất vùng chấm).
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);

  const samplesRef = useRef<number[][]>([]);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamOn(true);
      })
      .catch(() => setCamOn(false));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const captureFrame = useCallback((): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return Promise.resolve(null);
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
    setPhase('fitting');
    const fit = await fitCalibration(samplesRef.current);
    if (!fit.ok || !fit.params) {
      setPhase('calibrating');
      setIdx(POINTS - 1); // quay lại điểm cuối để thử lại
      setError('Không khớp được bộ hiệu chỉnh — bấm lại điểm cuối để thử.');
      return;
    }
    // Lưu để trang học bài / pipeline WebSocket dùng sau.
    localStorage.setItem('gaze_params', JSON.stringify(fit.params));
    localStorage.setItem('gaze_calibrated_at', new Date().toISOString());
    // Lưu lên backend để phiên học truy vấn được bộ tham số này.
    void saveCalibration(fit.params, samplesRef.current.length);
    goToCourse();
  }, [goToCourse]);

  const handleDotClick = async () => {
    if (phase !== 'calibrating') return;
    const p = points[idx];
    setPhase('sending');
    setError(null);
    await new Promise((r) => setTimeout(r, 250)); // feedback bấm → gửi

    // Camera bật nhưng chưa có frame → bảo bấm lại; không camera → mock.
    const frame = await captureFrame();
    if (camOn && frame === null) {
      setPhase('calibrating');
      setError('Camera chưa bắt được hình — bấm lại sau một nhịp.');
      return;
    }

    const result = await submitCalibrationPoint(frame, p.x / 100, p.y / 100);
    if (!result.ok) {
      setPhase('calibrating');
      setError(ERROR_TEXT[result.error ?? ''] ?? 'Gửi điểm thất bại — bấm lại.');
      return;
    }

    if (result.sample) samplesRef.current.push(result.sample);

    if (idx + 1 < points.length) {
      setIdx(idx + 1);
      setPhase('calibrating');
    } else {
      await finish();
    }
  };

  const current = points[idx];
  const progress = ((idx + (phase === 'fitting' ? 1 : 0)) / POINTS) * 100;

  return (
    <div className="relative h-dvh overflow-hidden bg-slate-100 text-slate-900 font-sans antialiased">
      {/* Chấm đỏ hiện tại — chỉ 1 chấm một lúc */}
      {phase !== 'fitting' && (
        <button
          onClick={handleDotClick}
          disabled={phase === 'sending'}
          aria-label={`Điểm hiệu chỉnh ${idx + 1}/${POINTS}`}
          className="group absolute z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full outline-none"
          style={{ left: `${current.x}%`, top: `${current.y}%` }}
        >
          <span className={`absolute inset-0 rounded-full bg-rose-500/20 transition group-hover:bg-rose-500/30 ${phase === 'sending' ? 'animate-ping' : ''}`} />
          <span className="absolute inset-2 rounded-full bg-rose-500/40" />
          <span className="relative h-5 w-5 rounded-full border-2 border-white bg-rose-500 shadow-lg transition group-hover:scale-110" />
        </button>
      )}

      {/* Thông báo OVERLAY MỜ giữa màn hình — không chiếm đất, không chặn bấm chấm.
          pointer-events-none ở container → bấm xuyên qua tới chấm đỏ; chỉ nút "Làm sau"
          là pointer-events-auto. bg mờ + blur → chấm phía sau vẫn nhìn thấy. */}
      <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
        <div className="pointer-events-none w-full max-w-xs rounded-2xl border border-slate-200/70 bg-white/55 px-5 py-4 text-center shadow-lg backdrop-blur-sm">
          <p className="text-sm font-bold text-slate-900">Hiệu chỉnh mắt</p>

          {phase === 'fitting' ? (
            <p className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-600">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
              Đang tính bộ tham số…
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Nhìn thẳng vào chấm đỏ rồi <span className="font-semibold text-slate-800">bấm vào chấm</span> để ghi nhận. Chấm tiếp theo sẽ hiện sau khi ghi nhận xong.
            </p>
          )}

          {/* Tiến độ */}
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/80">
              <div className="h-full rounded-full bg-cyan-600 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="shrink-0 text-xs font-semibold text-slate-600">{Math.min(idx, POINTS)}/{POINTS}</span>
          </div>

          {error && (
            <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-600">{error}</p>
          )}

          <div className="mt-3 flex items-center justify-center gap-2">
            {/* Camera preview nhỏ */}
            {camOn && (
              <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                <video
                  ref={videoRef}
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
