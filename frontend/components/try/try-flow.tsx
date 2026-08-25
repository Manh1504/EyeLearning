'use client';

// components/try/try-flow.tsx — Luồng dùng thử cho KHÁCH (không cần đăng nhập).
//   intro → calibrate (16 điểm, protocol /session) → xem 3 slide mẫu + thu gaze
//   → heatmap tính HOÀN TOÀN local từ gaze đã thu.
//
// 100% không ghi DB: chỉ gọi AI service (HTTP /gaze/* qua Next rewrite + WS
// /session/{sid}/stream). Gaze thu được giữ trong ref, không POST lên backend.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  RiArrowLeftSLine,
  RiArrowRightLine,
  RiArrowRightSLine,
  RiBarChartLine,
  RiCameraLine,
  RiCheckboxCircleLine,
  RiEyeLine,
  RiRefreshLine,
} from '@remixicon/react';

import { Button } from '@/components/ui/button';
import { useGazeTracker } from '@/hooks/use-gaze-tracker';
import {
  buildCalibrationPoints,
  clearStoredGazeSession,
  createGazeSession,
  storeGazeSession,
  submitCalibrationSample,
  trainGazeSession,
  type CalPoint,
} from '@/lib/api/calibration';

const DEMO_SLIDES = [
  { id: 'demo-1', title: 'Gradient Descent — Trang bìa', src: '/demo/slide-1.svg' },
  { id: 'demo-2', title: 'Ý tưởng cốt lõi', src: '/demo/slide-2.svg' },
  { id: 'demo-3', title: 'Tốc độ học (learning rate)', src: '/demo/slide-3.svg' },
];

type Step = 'intro' | 'calibrate' | 'view' | 'result';

interface GazeRecord {
  slide: number;
  x: number; // -1 = không nhìn màn (no_face)
  y: number;
}

// ---------- Bảng màu heatmap (giống heatmap-viewer.tsx) ----------

const HEAT_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [30, 60, 200]],
  [0.25, [60, 180, 250]],
  [0.5, [80, 215, 120]],
  [0.75, [250, 210, 60]],
  [1.0, [235, 70, 50]],
];

function heatColor(t: number): [number, number, number] {
  if (t <= 0) return HEAT_STOPS[0][1];
  if (t >= 1) return HEAT_STOPS[HEAT_STOPS.length - 1][1];
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    if (t <= HEAT_STOPS[i][0]) {
      const [t0, c0] = HEAT_STOPS[i - 1];
      const [t1, c1] = HEAT_STOPS[i];
      const u = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * u),
        Math.round(c0[1] + (c1[1] - c0[1]) * u),
        Math.round(c0[2] + (c1[2] - c0[2]) * u),
      ];
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

// ---------- Bước 2: hiệu chỉnh (khách) — logic như student/calibration.tsx ----------

const SAMPLES_PER_POINT = 5;
const MAX_CAPTURES_PER_POINT = 10;

const CALIB_ERROR_TEXT: Record<string, string> = {
  no_face: 'Không phát hiện khuôn mặt — hãy nhìn thẳng vào chấm đỏ rồi bấm lại.',
  invalid_image: 'Ảnh webcam không hợp lệ — bấm lại.',
  no_camera: 'Camera không khả dụng — hãy cho phép camera rồi thử lại.',
  network_error: 'Không kết nối được dịch vụ AI — kiểm tra container gaze-api rồi bấm lại.',
  insufficient: 'Chưa đủ mẫu cho điểm này — hãy bấm lại và giữ nhìn vào chấm.',
};

type CalPhase = 'calibrating' | 'sending' | 'training';

function GuestCalibration({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const points = useMemo<CalPoint[]>(() => buildCalibrationPoints(), []);
  const total = points.length;

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<CalPhase>('calibrating');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);

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
  }, [points]);

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

  const finish = useCallback(async () => {
    if (!sessionId) return;
    setPhase('training');
    const trained = await trainGazeSession(sessionId);
    if (!trained.ok) {
      setPhase('calibrating');
      setIdx(total - 1);
      setError(
        trained.error === 'insufficient_samples'
          ? CALIB_ERROR_TEXT.insufficient
          : trained.error === 'network_error'
            ? 'Không kết nối được dịch vụ AI khi huấn luyện — bấm lại điểm cuối để thử.'
            : 'Không huấn luyện được bộ hiệu chỉnh — bấm lại điểm cuối để thử.',
      );
      return;
    }
    storeGazeSession(sessionId);
    onDone();
  }, [sessionId, total, onDone]);

  const handleDotClick = async () => {
    if (phase !== 'calibrating') return;
    if (!sessionId) {
      setError('Dịch vụ AI chưa sẵn sàng — hãy thử lại sau một nhịp.');
      return;
    }
    setPhase('sending');
    setError(null);
    await new Promise((r) => setTimeout(r, 250));

    if (!camOn) {
      setPhase('calibrating');
      setError(CALIB_ERROR_TEXT.no_camera);
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
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    if (accepted < SAMPLES_PER_POINT) {
      setPhase('calibrating');
      setError(failed ? (CALIB_ERROR_TEXT[failed] ?? 'Gửi điểm thất bại — bấm lại.') : CALIB_ERROR_TEXT.insufficient);
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
  const busy = phase !== 'calibrating';
  const progress = ((idx + (phase === 'training' ? 1 : 0)) / total) * 100;

  return (
    <div className="relative h-dvh overflow-hidden bg-slate-100 text-slate-900 font-sans antialiased">
      {phase !== 'training' && (
        <button
          onClick={handleDotClick}
          disabled={busy}
          aria-label={`Điểm hiệu chỉnh ${idx + 1}/${total}`}
          className="group absolute z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none disabled:cursor-default"
          style={{ left: `${current.x * 100}%`, top: `${current.y * 100}%` }}
        >
          <span className="absolute inset-0 rounded-full bg-rose-500/20 transition group-hover:bg-rose-500/30" />
          <span className={`absolute inset-2 rounded-full bg-rose-500/40 transition ${busy ? 'animate-pulse' : ''}`} />
          <span className={`relative h-5 w-5 rounded-full border-2 border-white bg-rose-500 shadow-lg transition ${busy ? 'animate-pulse' : 'group-hover:scale-110'}`} />
        </button>
      )}

      <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
        <div className="pointer-events-none w-full max-w-sm rounded-2xl border border-slate-200/70 bg-white/70 px-5 py-4 text-center shadow-lg backdrop-blur-sm">
          <p className="text-sm font-bold text-slate-900">Hiệu chỉnh điểm nhìn</p>

          {phase === 'training' ? (
            <p className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-600">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
              Đang huấn luyện bộ hiệu chỉnh…
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Nhìn thẳng vào chấm đỏ rồi <span className="font-semibold text-slate-800">bấm vào chấm</span> để ghi nhận. Chấm tiếp theo hiện sau khi ghi nhận xong.
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/80">
              <div className="h-full rounded-full bg-cyan-600 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="shrink-0 text-xs font-semibold text-slate-600">{Math.min(idx + 1, total)}/{total}</span>
          </div>

          {error && (
            <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-600">{error}</p>
          )}

          <div className="mt-3 flex items-center justify-center gap-2">
            {camOn && (
              <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
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

          <button
            type="button"
            onClick={onSkip}
            className="pointer-events-auto mt-3 text-xs font-medium text-slate-500 underline-offset-2 hover:text-cyan-700 hover:underline"
          >
            Bỏ qua hiệu chỉnh — dùng dữ liệu mô phỏng
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Bước 4: heatmap local (canvas giống heatmap-viewer.tsx) ----------

function HeatmapSlide({
  src,
  title,
  points,
}: {
  src: string;
  title: string;
  points: Array<[number, number]>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (points.length === 0) return;

    const SCALE = 6;
    const dw = Math.max(12, Math.round(width / SCALE));
    const dh = Math.max(12, Math.round(height / SCALE));
    const density = document.createElement('canvas');
    density.width = dw;
    density.height = dh;
    const dctx = density.getContext('2d');
    if (!dctx) return;
    dctx.globalCompositeOperation = 'lighter';

    const pointR = Math.max(6, dw * 0.11);
    for (const [x, y] of points) {
      const cx = x * dw;
      const cy = y * dh;
      const gradient = dctx.createRadialGradient(cx, cy, 0, cx, cy, pointR);
      gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
      gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      gradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      dctx.fillStyle = gradient;
      dctx.beginPath();
      dctx.arc(cx, cy, pointR, 0, Math.PI * 2);
      dctx.fill();
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(density, 0, 0, dw, dh, 0, 0, width, height);

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;

    let maxAlpha = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > maxAlpha) maxAlpha = data[i];
    }
    if (maxAlpha < 1) return;
    const gain = 255 / maxAlpha;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      if (a < 0.02) {
        data[i + 3] = 0;
        continue;
      }
      const t = Math.min(1, Math.pow(a * gain, 0.6));
      const [r, g, b] = heatColor(t);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = Math.round(85 + t * 170);
    }

    ctx.putImageData(img, 0, 0);
  }, [points, stageSize]);

  return (
    <div
      ref={stageRef}
      className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      style={{ aspectRatio: '16 / 9' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={title} className="absolute inset-0 h-full w-full bg-white object-contain" />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity: 0.88 }}
      />
      <span className="absolute bottom-2 left-2 rounded-md bg-slate-900/70 px-2 py-1 text-[11px] font-medium text-white">
        {title}
      </span>
    </div>
  );
}

// ---------- Luồng chính ----------

const STEP_LABELS: Array<{ key: Step; label: string }> = [
  { key: 'calibrate', label: 'Hiệu chỉnh' },
  { key: 'view', label: 'Xem bài mẫu' },
  { key: 'result', label: 'Heatmap của bạn' },
];

export default function TryFlow() {
  const [step, setStep] = useState<Step>('intro');
  const [calibrated, setCalibrated] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [gazeDot, setGazeDot] = useState<{ x: number; y: number } | null>(null);
  // Snapshot gaze tại thời điểm bấm "Xem heatmap" để tính kết quả (ref không đọc trong render).
  const [resultRecords, setResultRecords] = useState<GazeRecord[]>([]);
  const [validCount, setValidCount] = useState(0);

  const gazeRef = useRef<GazeRecord[]>([]);
  const slideRef = useRef(0);

  useEffect(() => {
    slideRef.current = currentSlide;
  }, [currentSlide]);

  const total = DEMO_SLIDES.length;

  const handlePoint = useCallback((x: number, y: number) => {
    gazeRef.current.push({ slide: slideRef.current, x, y });
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      setGazeDot({ x, y });
      setValidCount((c) => c + 1);
    }
  }, []);

  const { source: gazeSource } = useGazeTracker({
    enabled: step === 'view',
    calibrated,
    onPoint: handlePoint,
  });

  const results = useMemo(() => {
    return DEMO_SLIDES.map((slide, i) => {
      const records = resultRecords.filter((r) => r.slide === i);
      const valid = records.filter((r) => r.x >= 0 && r.x <= 1 && r.y >= 0 && r.y <= 1);
      const onSlide = records.length ? Math.round((valid.length / records.length) * 100) : 0;
      return {
        slide,
        points: valid.map((r) => [r.x, r.y] as [number, number]),
        total: records.length,
        valid: valid.length,
        onSlide,
      };
    });
  }, [resultRecords]);

  const totalValid = useMemo(
    () => results.reduce((sum, r) => sum + r.valid, 0),
    [results],
  );

  const reset = () => {
    clearStoredGazeSession();
    gazeRef.current = [];
    setResultRecords([]);
    setValidCount(0);
    setGazeDot(null);
    setCalibrated(false);
    setCurrentSlide(0);
    setStep('intro');
  };

  const showResult = () => {
    setResultRecords([...gazeRef.current]);
    setStep('result');
  };

  // ---------- Bước 2 & 3 render toàn màn hình riêng ----------

  if (step === 'calibrate') {
    return (
      <GuestCalibration
        onDone={() => {
          setCalibrated(true);
          setStep('view');
        }}
        onSkip={() => {
          setCalibrated(false);
          setStep('view');
        }}
      />
    );
  }

  const stepIndex = STEP_LABELS.findIndex((s) => s.key === step);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-cyan-700"
          >
            <RiArrowLeftSLine className="h-4 w-4" />
            Trang chủ
          </Link>

          <div className="hidden items-center gap-2 sm:flex">
            {STEP_LABELS.map((s, i) => (
              <span key={s.key} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    i <= stepIndex ? 'bg-cyan-700 text-white' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`text-xs font-semibold ${i <= stepIndex ? 'text-slate-900' : 'text-slate-400'}`}>
                  {s.label}
                </span>
                {i < STEP_LABELS.length - 1 && <span className="h-px w-6 bg-slate-200" />}
              </span>
            ))}
          </div>

          <span className="text-xs font-medium text-slate-400">Chế độ khách</span>
        </div>
      </header>

      {step === 'intro' && (
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-800">
              <RiEyeLine className="h-3.5 w-3.5" />
              Dùng thử miễn phí
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">
              Trải nghiệm theo dõi điểm nhìn trong 2 phút
            </h1>
            <p className="mt-3 text-slate-600">
              Không cần tài khoản. Hệ thống dùng webcam ước lượng bạn đang nhìn đâu,
              sau đó vẽ lại bản đồ nhiệt (heatmap) từ chính dữ liệu của bạn.
            </p>

            <ol className="mt-8 space-y-4">
              {[
                { icon: RiCameraLine, title: 'Hiệu chỉnh (16 điểm)', desc: 'Nhìn vào từng chấm đỏ và bấm — mất khoảng 1 phút.' },
                { icon: RiEyeLine, title: 'Xem 3 trang bài giảng mẫu', desc: 'Hệ thống thu điểm nhìn của bạn trong lúc xem.' },
                { icon: RiBarChartLine, title: 'Nhận heatmap ngay', desc: 'Bản đồ nhiệt tính tức thì từ dữ liệu vừa thu.' },
              ].map((s, i) => (
                <li key={s.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-100 bg-cyan-50 text-cyan-700">
                    <s.icon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{i + 1}. {s.title}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => setStep('calibrate')}
                className="group flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-6 py-3.5 font-semibold text-white shadow-lg shadow-cyan-700/25 transition-all hover:-translate-y-0.5 hover:bg-cyan-800"
              >
                Bắt đầu hiệu chỉnh
                <RiArrowRightLine className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button
                onClick={() => {
                  setCalibrated(false);
                  setStep('view');
                }}
                className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3.5 font-semibold text-slate-700 transition-colors hover:border-cyan-300 hover:bg-cyan-50/50"
              >
                Bỏ qua — dùng dữ liệu mô phỏng
              </button>
            </div>

            <p className="mt-6 flex items-start gap-1.5 text-xs text-slate-400">
              <RiCheckboxCircleLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-600" />
              Dữ liệu điểm nhìn chỉ lưu trên trình duyệt của bạn trong phiên này — không ghi vào hệ thống, không cần đăng nhập.
            </p>
          </div>
        </main>
      )}

      {step === 'view' && (
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-slate-200/70 bg-white px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-[1000px] items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-slate-400">Bài giảng mẫu · Gradient Descent</p>
                <h1 className="mt-0.5 truncate text-sm font-semibold sm:text-base">{DEMO_SLIDES[currentSlide].title}</h1>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-slate-400">Trang</p>
                <p className="text-sm font-semibold tabular-nums">
                  {currentSlide + 1}
                  <span className="font-normal text-slate-400"> / {total}</span>
                </p>
              </div>
              {gazeSource === 'real' ? (
                <span className="hidden items-center gap-1.5 text-xs font-medium text-emerald-600 sm:flex">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Đang theo dõi
                </span>
              ) : (
                <span className="hidden items-center gap-1.5 text-xs font-medium text-amber-600 sm:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Mô phỏng
                </span>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-6 sm:px-6">
            <div className="mx-auto w-full max-w-[900px]">
              <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-900/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={DEMO_SLIDES[currentSlide].src}
                  alt={DEMO_SLIDES[currentSlide].title}
                  className="block h-auto w-full bg-white object-contain"
                />
              </div>
              <p className="mt-3 text-center text-xs text-slate-400">
                Đọc trang tự nhiên — hệ thống đang ghi nhận điểm nhìn của bạn.
              </p>
            </div>
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-2 sm:px-6">
            <div className="mx-auto flex max-w-[1000px] items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentSlide((v) => Math.max(0, v - 1))}
                disabled={currentSlide === 0}
              >
                <RiArrowLeftSLine />
                <span className="hidden sm:inline">Trang trước</span>
              </Button>

              <div className="flex min-w-0 flex-1 items-center gap-3 px-1 sm:px-3">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-cyan-700 transition-[width] duration-300"
                    style={{ width: `${((currentSlide + 1) / total) * 100}%` }}
                  />
                </div>
              </div>

              {currentSlide < total - 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentSlide((v) => Math.min(total - 1, v + 1))}
                >
                  <span className="hidden sm:inline">Trang sau</span>
                  <RiArrowRightSLine />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={showResult}
                  disabled={validCount === 0}
                >
                  <RiBarChartLine />
                  Xem heatmap của bạn
                </Button>
              )}
            </div>
          </footer>

          {gazeDot && (
            <div className="pointer-events-none fixed inset-0 z-30">
              <span
                className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-rose-500 shadow-[0_1px_6px_rgba(0,0,0,0.45)]"
                style={{ left: `${gazeDot.x * 100}%`, top: `${gazeDot.y * 100}%` }}
              />
            </div>
          )}
        </main>
      )}

      {step === 'result' && (
        <main className="flex-1 px-4 py-8 sm:px-6">
          <div className="mx-auto max-w-[1000px]">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-cyan-700">Kết quả của bạn</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                Heatmap điểm nhìn
              </h1>
              <p className="mt-2 text-slate-500">
                Vùng màu đỏ là nơi bạn nhìn lâu nhất, xanh là nơi nhìn ít hơn.
                {calibrated ? '' : ' (Phiên này dùng dữ liệu mô phỏng vì bạn đã bỏ qua hiệu chỉnh.)'}
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: 'Tổng mẫu điểm nhìn', value: String(totalValid) },
                { label: 'Số trang đã xem', value: `${results.filter((r) => r.total > 0).length}/${total}` },
                { label: 'Tỷ lệ nhìn vào trang', value: `${totalValid ? Math.round((results.reduce((s, r) => s + r.valid, 0) / Math.max(1, results.reduce((s, r) => s + r.total, 0))) * 100) : 0}%` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                  <p className="text-2xl font-extrabold tabular-nums text-cyan-700">{s.value}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 space-y-6">
              {results.map((r, i) => (
                <div key={r.slide.id}>
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">Trang {i + 1} · {r.slide.title}</span>
                    <span>
                      {r.valid} mẫu · nhìn vào trang {r.onSlide}%
                    </span>
                  </div>
                  <HeatmapSlide src={r.slide.src} title={r.slide.title} points={r.points} />
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button variant="outline" onClick={reset}>
                <RiRefreshLine />
                Làm lại từ đầu
              </Button>
              <Link
                href="/account/login"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-cyan-700 px-6 text-sm font-semibold text-white shadow transition-colors hover:bg-cyan-800"
              >
                Đăng nhập để dùng đầy đủ
                <RiArrowRightLine className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
