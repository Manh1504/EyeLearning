'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  buildCalibrationPoints,
  clearStoredGazeSession,
  createGazeSession,
  DEFAULT_MAX_TRAIN_MAE,
  deleteGazeSession,
  fetchCalibrationConfig,
  formatMaePercent,
  saveCalibrationToBackend,
  storeGazeSession,
  submitCalibrationSample,
  trainGazeSession,
  type CalPoint,
} from '@/lib/api/calibration';
import { getDeviceFingerprint } from '@/lib/api/student';

const SAMPLES_PER_POINT = 2;
const MAX_CAPTURES_PER_POINT = 5;
const CAPTURE_GAP_MS = 100;
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
  const [threshold, setThreshold] = useState(DEFAULT_MAX_TRAIN_MAE);
  const [scoringEnabled, setScoringEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);

  useEffect(() => {
    fetchCalibrationConfig().then((cfg) => { setThreshold(cfg.threshold); setScoringEnabled(cfg.enabled); }).catch(() => {});
  }, []);
  useEffect(() => {
    let cancelled = false;
    const w = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight || 720 : 720;
    createGazeSession(points, w, h).then((res) => { if (!cancelled && res.ok && res.sessionId) setSessionId(res.sessionId); }).catch(() => {});
    return () => { cancelled = true; };
  }, [points, sessionNonce]);

  const resetCalibration = useCallback(() => {
    if (sessionId) deleteGazeSession(sessionId);
    clearStoredGazeSession();
    setSessionId(null); setError(null); setIdx(0); setPhase('calibrating'); setSessionNonce((v) => v + 1);
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => undefined); }
        setCamOn(true);
      }).catch(() => setCamOn(false));
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video) return null;
    let waited = 0;
    while (video.videoWidth === 0 && waited < 1000) { await new Promise((r) => setTimeout(r, 50)); waited += 50; }
    if (video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? null), 'image/jpeg', 0.9));
  }, []);

  const goToCourse = useCallback(() => router.replace(`/student/courses/${courseId}`), [courseId, router]);
  const handleStop = useCallback(() => {
    if (sessionId) deleteGazeSession(sessionId);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    router.replace(`/student/courses/${courseId}`);
  }, [sessionId, courseId, router]);

  const finish = useCallback(async () => {
    if (!sessionId) return;
    setPhase('training');
    const trained = await trainGazeSession(sessionId);
    const maeLabel = trained.maePx != null ? formatMaePercent(trained.maePx) : null;
    const maeFail = scoringEnabled && trained.maePx != null && trained.maePx > threshold;
    const failed = !trained.ok || maeFail;
    if (failed) {
      const msg = !trained.ok
        ? trained.error === 'insufficient_samples' ? ERROR_TEXT.insufficient + ' — sẽ làm lại từ đầu.' : trained.error === 'network_error' ? 'Không kết nối được dịch vụ AI khi huấn luyện — sẽ làm lại từ đầu.' : 'Không huấn luyện được — sẽ làm lại từ đầu.'
        : `Độ chính xác thấp (lệch ~${maeLabel}, cho phép ${formatMaePercent(threshold)}). Sẽ làm lại — giữ mắt nhìn chấm đỏ.`;
      resetCalibration(); setError(msg); return;
    }
    storeGazeSession(sessionId, window.innerWidth, window.innerHeight);
    void saveCalibrationToBackend({ deviceFingerprint: getDeviceFingerprint(), maePx: trained.maePx ?? null, screenWidth: window.innerWidth, screenHeight: window.innerHeight });
    goToCourse();
  }, [sessionId, resetCalibration, goToCourse, scoringEnabled, threshold]);

  const handleDotClick = async () => {
    if (phase !== 'calibrating') return;
    if (!sessionId) { setError('Dịch vụ AI chưa sẵn sàng — thử lại sau.'); return; }
    if (!camOn) { setError(ERROR_TEXT.no_camera); return; }
    setPhase('sending'); setError(null);
    const point = points[idx];
    let accepted = 0; let failed: string | null = null;
    for (let attempt = 0; attempt < MAX_CAPTURES_PER_POINT && accepted < SAMPLES_PER_POINT; attempt++) {
      const frame = await captureFrame();
      if (!frame) { failed = 'no_camera'; break; }
      const result = await submitCalibrationSample(sessionId, frame, point.id);
      if (result.status === 'accepted') accepted += 1;
      else if (result.status === 'no_face' || result.status === 'invalid_image') { failed = result.status; break; }
      else { failed = 'network_error'; break; }
      if (accepted < SAMPLES_PER_POINT) await new Promise((r) => setTimeout(r, CAPTURE_GAP_MS));
    }
    if (accepted < SAMPLES_PER_POINT) { setPhase('calibrating'); setError(failed ? (ERROR_TEXT[failed] ?? 'Gửi điểm thất bại — bấm lại.') : ERROR_TEXT.insufficient); return; }
    if (idx === total - 1) { await finish(); return; }
    setIdx(idx + 1); setPhase('calibrating');
  };

  const current = points[idx];

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-black text-white">
      {/* hidden camera */}
      <video ref={(el) => { videoRef.current = el; if (el && streamRef.current && !el.srcObject) el.srcObject = streamRef.current; }} autoPlay playsInline muted aria-hidden className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0" />

      {/* Calibration canvas — black full */}
      <div className="relative flex flex-1 items-center justify-center">
        {(phase === 'calibrating' || phase === 'sending') && (
          <button
            onClick={handleDotClick}
            disabled={phase !== 'calibrating'}
            aria-label={`Điểm ${idx + 1}/${total}`}
            className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 outline-none disabled:cursor-default"
            style={{ left: `${current.x * 100}%`, top: `${current.y * 100}%` }}
          >
            {/* concentric target matching PNG */}
            <span className="relative flex h-[120px] w-[120px] items-center justify-center rounded-full bg-[#ffe9e9]/90">
              <span className="absolute inset-3 rounded-full border border-dashed border-red-300" />
              <span className="absolute h-[88px] w-[88px] rounded-full border-2 border-[#d91e1e]" />
              <span className="absolute h-[52px] w-[52px] rounded-full bg-red-500/10" />
              <span className="absolute h-[52px] w-[52px] rounded-full border border-red-300/40" />
              <span className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#d91e1e] shadow-lg">
                <span className="h-2 w-2 rounded-full bg-white" />
              </span>
              {/* crosshair */}
              <span className="pointer-events-none absolute left-1/2 top-1/2 h-[88px] w-px -translate-x-1/2 -translate-y-1/2 bg-red-400/60" />
              <span className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[88px] -translate-x-1/2 -translate-y-1/2 bg-red-400/60" />
            </span>
            <span className="rounded-full bg-[#0f2d5e] px-3 py-1 text-xs font-bold tracking-wide">● ĐIỂM {idx + 1} / {total} (MỤC TIÊU)</span>
            <span className="rounded-md border border-red-200 bg-[#fff1f1] px-2.5 py-1 text-xs font-semibold text-[#b4232b]">Click vào điểm này để lấy mẫu</span>
          </button>
        )}

        {phase === 'training' && (
          <div className="flex flex-col items-center gap-3">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <p className="text-sm text-white/80">Đang huấn luyện bộ hiệu chỉnh…</p>
          </div>
        )}

        {/* progress subtle top */}
        <div className="pointer-events-none absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2">
          <div className="h-1 w-32 overflow-hidden rounded-full bg-white/20">
            <div className="h-full bg-brand-cyan transition-all" style={{ width: `${((idx + (phase==='training'?1:0))/ total)*100}%` }} />
          </div>
          <span className="text-xs text-white/60">{idx + 1}/{total}</span>
        </div>

        {error && (
          <div className="absolute bottom-24 left-1/2 max-w-[min(90vw,420px)] -translate-x-1/2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-[#b4232b] shadow-lg">
            {error}
          </div>
        )}
      </div>

      {/* Footer guidance panel — matches Footer - BOTTOM GUIDANCE image */}
      <footer className="flex h-[56px] shrink-0 items-center gap-3 border-t border-white/10 bg-white px-4 text-foreground">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-[#e8f9fd] text-[#0b5f7a]">◈</span>
          <div className="leading-tight">
            <p className="text-[11px] font-bold tracking-wide text-[#0b5f7a]">HƯỚNG DẪN HIỆU CHUẨN</p>
            <p className="text-xs font-semibold text-foreground">Giữ cố định đầu, hướng mắt nhìn thẳng và click vào chấm đỏ khi xuất hiện trên màn hình</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">TẬP TRUNG THỊ GIÁC</span>
          <button onClick={resetCalibration} className="h-8 rounded-full border bg-white px-3 text-xs font-semibold hover:bg-muted">↻ Bắt đầu lại [R]</button>
          <button onClick={handleStop} className="h-8 rounded-full border bg-white px-3 text-xs font-semibold hover:bg-muted">✕ Hủy hiệu chuẩn [ESC]</button>
        </div>
      </footer>
    </div>
  );
}
