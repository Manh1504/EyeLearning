'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  RiRefreshLine,
  RiCloseLine,
  RiFocus3Line,
  RiErrorWarningLine,
} from '@remixicon/react';
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
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const SAMPLES_PER_POINT = 2;
const MAX_CAPTURES_PER_POINT = 5;
const CAPTURE_GAP_MS = 100;
type Phase = 'calibrating' | 'sending' | 'training';
const ERROR_TEXT: Record<string, string> = {
  no_face: 'Không phát hiện khuôn mặt — hãy nhìn thẳng vào chấm đỏ rồi bấm lại.',
  invalid_image: 'Ảnh webcam không hợp lệ — bấm lại.',
  no_camera: 'Camera không khả dụng — hãy cho phép camera rồi tải lại trang.',
  network_error: 'Không kết nối được dịch vụ AI — kiểm tra kết nối mạng rồi bấm lại.',
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
        ? trained.error === 'insufficient_samples' ? ERROR_TEXT.insufficient + ' — sẽ làm lại từ đầu.' : trained.error === 'network_error' ? 'Lỗi kết nối — sẽ làm lại từ đầu.' : 'Lỗi xử lý — sẽ làm lại từ đầu.'
        : `Độ chính xác thấp (~${maeLabel}). Cần dưới ${formatMaePercent(threshold)}. Đang làm lại...`;
      resetCalibration(); setError(msg); return;
    }
    
    storeGazeSession(sessionId, window.innerWidth, window.innerHeight);
    void saveCalibrationToBackend({ deviceFingerprint: getDeviceFingerprint(), maePx: trained.maePx ?? null, screenWidth: window.innerWidth, screenHeight: window.innerHeight });
    goToCourse();
  }, [sessionId, resetCalibration, goToCourse, scoringEnabled, threshold]);

  const handleDotClick = async () => {
    if (phase !== 'calibrating') return;
    if (!sessionId) { setError('Dịch vụ AI đang khởi động — thử lại sau.'); return; }
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
    
    if (accepted < SAMPLES_PER_POINT) { setPhase('calibrating'); setError(failed ? (ERROR_TEXT[failed] ?? 'Lỗi điểm này — bấm lại.') : ERROR_TEXT.insufficient); return; }
    if (idx === total - 1) { await finish(); return; }
    
    setIdx(idx + 1); setPhase('calibrating');
  };

  const current = points[idx];
  const progressPct = ((idx + (phase === 'training' ? 1 : 0)) / total) * 100;

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-slate-950 text-white font-sans">
      <video ref={(el) => { videoRef.current = el; if (el && streamRef.current && !el.srcObject) el.srcObject = streamRef.current; }} autoPlay playsInline muted aria-hidden className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0" />

      {/* Main Area */}
      <div className="relative flex flex-1 items-center justify-center">
        
        {/* Progress Bar Top */}
        <div className="absolute top-6 left-1/2 flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-3">
          <div className="flex w-full items-center justify-between text-xs font-semibold tracking-widest text-slate-400">
            <span>HIỆU CHỈNH</span>
            <span className="text-white">{idx + 1} / {total}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div 
              className="h-full rounded-full bg-brand-cyan shadow-[0_0_12px_rgba(1,188,234,0.6)] transition-all duration-300 ease-out" 
              style={{ width: `${progressPct}%` }} 
            />
          </div>
        </div>

        {(phase === 'calibrating' || phase === 'sending') && (
          <button
            onClick={handleDotClick}
            disabled={phase !== 'calibrating'}
            aria-label={`Điểm ${idx + 1}/${total}`}
            className="group absolute z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none disabled:cursor-default"
            style={{ left: `${current.x * 100}%`, top: `${current.y * 100}%` }}
          >
            {/* Ripple rings */}
            <span className={cn("absolute inset-0 rounded-full border border-destructive/40 bg-destructive/10 transition-transform duration-1000", phase === 'calibrating' ? "animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" : "scale-110 opacity-0")} />
            <span className={cn("absolute inset-2 rounded-full bg-destructive/20 transition-transform duration-300", phase === 'sending' ? "scale-90" : "group-hover:scale-110")} />
            
            {/* Core dot */}
            <span className={cn(
              "relative flex h-6 w-6 items-center justify-center rounded-full bg-destructive shadow-lg transition-all duration-200",
              phase === 'sending' ? "scale-75 opacity-80" : "scale-100 group-hover:scale-110"
            )}>
              <span className="h-2 w-2 rounded-full bg-white" />
            </span>
          </button>
        )}

        {phase === 'training' && (
          <div className="flex flex-col items-center gap-5 rounded-2xl bg-white/5 p-8 backdrop-blur-md border border-white/10 shadow-2xl">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <span className="absolute h-full w-full animate-spin rounded-full border-4 border-brand-cyan/20 border-t-brand-cyan" />
              <RiFocus3Line className="h-6 w-6 text-brand-cyan animate-pulse" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white">Đang xử lý mô hình</h3>
              <p className="mt-1 max-w-xs text-sm text-slate-400">Hệ thống AI đang tối ưu hóa điểm nhìn dựa trên dữ liệu của bạn...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute bottom-24 left-1/2 flex w-full max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive-foreground backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-4">
            <RiErrorWarningLine className="h-5 w-5 shrink-0" />
            <p className="leading-relaxed">{error}</p>
          </div>
        )}
      </div>

      {/* Modern Footer Panel */}
      <footer className="relative z-10 flex shrink-0 flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10 bg-slate-900/80 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-cyan/20 text-brand-cyan">
            <RiFocus3Line className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold tracking-wider text-brand-cyan uppercase">Hướng dẫn</p>
            <p className="text-sm font-medium text-slate-300">Giữ yên đầu, nhìn thẳng và click vào chấm đỏ</p>
          </div>
        </div>
        
        <div className="flex w-full sm:w-auto items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={resetCalibration}
            className="flex-1 sm:flex-none rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          >
            <RiRefreshLine className="mr-2 h-4 w-4" /> Bắt đầu lại
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleStop}
            className="flex-1 sm:flex-none rounded-full text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <RiCloseLine className="mr-2 h-4 w-4" /> Hủy
          </Button>
        </div>
      </footer>
    </div>
  );
}
