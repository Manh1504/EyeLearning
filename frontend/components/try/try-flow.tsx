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

import { Button, buttonVariants } from '@/components/ui/button';
import { HeatmapCanvas } from '@/components/heatmap/heatmap-canvas';
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
import { cn } from '@/lib/utils';

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

function GuestCalibration({ onDone }: { onDone: () => void }) {
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
    <div className="relative h-dvh overflow-hidden bg-muted text-foreground font-sans antialiased">
      {phase !== 'training' && (
        <button
          onClick={handleDotClick}
          disabled={busy}
          aria-label={`Điểm hiệu chỉnh ${idx + 1}/${total}`}
          className="group absolute z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none disabled:cursor-default"
          style={{ left: `${current.x * 100}%`, top: `${current.y * 100}%` }}
        >
          <span className="absolute inset-0 rounded-full bg-destructive/20 transition group-hover:bg-destructive/30" />
          <span className={`absolute inset-2 rounded-full bg-destructive/40 transition ${busy ? 'animate-pulse' : ''}`} />
          <span className={`relative h-5 w-5 rounded-full border-2 border-white bg-destructive shadow-lg transition ${busy ? 'animate-pulse' : 'group-hover:scale-110'}`} />
        </button>
      )}

      <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
        <div className="pointer-events-none w-full max-w-sm rounded-xl border border-border bg-card px-5 py-4 text-center shadow-lg">
          <p className="text-sm font-bold text-foreground">Hiệu chỉnh điểm nhìn</p>

          {phase === 'training' ? (
            <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Đang huấn luyện bộ hiệu chỉnh…
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Nhìn thẳng vào chấm đỏ rồi <span className="font-semibold text-foreground">bấm vào chấm</span> để ghi nhận. Chấm tiếp theo hiện sau khi ghi nhận xong.
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand-cyan transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">{Math.min(idx + 1, total)}/{total}</span>
          </div>

          {error && (
            <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">{error}</p>
          )}

          <div className="mt-3 flex items-center justify-center gap-2">
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

          <p className="mt-3 text-xs text-muted-foreground">
            Cần hoàn tất hiệu chỉnh để hệ thống theo dõi điểm nhìn thật của bạn.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------- Luồng chính (heatmap vẽ bằng HeatmapCanvas dùng chung) ----------

const STEP_LABELS: Array<{ key: Step; label: string }> = [
  { key: 'calibrate', label: 'Hiệu chỉnh' },
  { key: 'view', label: 'Xem bài mẫu' },
  { key: 'result', label: 'Heatmap của bạn' },
];

export default function TryFlow() {
  const [step, setStep] = useState<Step>('intro');
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

  // Luồng dùng thử bắt buộc hiệu chỉnh thật — không dùng dữ liệu mô phỏng.
  const { source: gazeSource } = useGazeTracker({
    enabled: step === 'view',
    calibrated: true,
    onPoint: handlePoint,
    allowSimulation: false,
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
          setStep('view');
        }}
      />
    );
  }

  const stepIndex = STEP_LABELS.findIndex((s) => s.key === step);

  return (
    <div className="flex min-h-dvh flex-col bg-muted text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <RiArrowLeftSLine className="h-4 w-4" />
            Trang chủ
          </Link>

          <div className="hidden items-center gap-2 sm:flex">
            {STEP_LABELS.map((s, i) => (
              <span key={s.key} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    i <= stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`text-xs font-semibold ${i <= stepIndex ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {s.label}
                </span>
                {i < STEP_LABELS.length - 1 && <span className="h-px w-6 bg-border" />}
              </span>
            ))}
          </div>

          <span className="text-xs font-medium text-muted-foreground">Chế độ khách</span>
        </div>
      </header>

      {step === 'intro' && (
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-8 shadow-sm sm:p-12">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ring/40 bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              <RiEyeLine className="h-3.5 w-3.5" />
              Dùng thử miễn phí
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
              Trải nghiệm theo dõi điểm nhìn trong 2 phút
            </h1>
            <p className="mt-3 text-muted-foreground">
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
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                    <s.icon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{i + 1}. {s.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => setStep('calibrate')} className="w-full sm:w-auto">
                Bắt đầu hiệu chỉnh
                <RiArrowRightLine data-icon="inline-end" />
              </Button>
            </div>

            <p className="mt-6 flex items-start gap-1.5 text-xs text-muted-foreground">
              <RiCheckboxCircleLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              Dữ liệu điểm nhìn chỉ lưu trên trình duyệt của bạn trong phiên này — không ghi vào hệ thống, không cần đăng nhập.
            </p>
          </div>
        </main>
      )}

      {step === 'view' && (
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border bg-card px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-[1000px] items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">Bài giảng mẫu · Gradient Descent</p>
                <h1 className="mt-0.5 truncate text-sm font-semibold sm:text-base">{DEMO_SLIDES[currentSlide].title}</h1>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground">Trang</p>
                <p className="text-sm font-semibold tabular-nums">
                  {currentSlide + 1}
                  <span className="font-normal text-muted-foreground"> / {total}</span>
                </p>
              </div>
              {gazeSource === 'real' ? (
                <span className="hidden items-center gap-1.5 text-xs font-medium text-emerald-600 sm:flex">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Đang theo dõi
                </span>
              ) : (
                <span className="hidden items-center gap-1.5 text-xs font-medium text-destructive sm:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                  Chưa kết nối theo dõi
                </span>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-muted px-3 py-6 sm:px-6">
            <div className="mx-auto w-full max-w-[900px]">
              <div className="overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={DEMO_SLIDES[currentSlide].src}
                  alt={DEMO_SLIDES[currentSlide].title}
                  className="block h-auto w-full bg-white object-contain"
                />
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Đọc trang tự nhiên — hệ thống đang ghi nhận điểm nhìn của bạn.
              </p>
              {gazeSource === 'off' && (
                <p className="mx-auto mt-3 max-w-[900px] rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-center text-xs font-medium text-destructive">
                  Chưa kết nối được camera hoặc dịch vụ theo dõi — hãy kiểm tra camera rồi tải lại trang. Heatmap sẽ trống nếu không có dữ liệu điểm nhìn.
                </p>
              )}
            </div>
          </div>

          <footer className="shrink-0 border-t border-border bg-card px-4 py-2 sm:px-6">
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
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand-cyan transition-[width] duration-300"
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
                className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-destructive shadow-[0_1px_6px_rgba(0,0,0,0.45)]"
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
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Kết quả của bạn</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                Heatmap điểm nhìn
              </h1>
              <p className="mt-2 text-muted-foreground">
                Vùng màu đỏ là nơi bạn nhìn lâu nhất, xanh là nơi nhìn ít hơn.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: 'Tổng mẫu điểm nhìn', value: String(totalValid) },
                { label: 'Số trang đã xem', value: `${results.filter((r) => r.total > 0).length}/${total}` },
                { label: 'Tỷ lệ nhìn vào trang', value: `${totalValid ? Math.round((results.reduce((s, r) => s + r.valid, 0) / Math.max(1, results.reduce((s, r) => s + r.total, 0))) * 100) : 0}%` },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-card p-4 text-center shadow-sm">
                  <p className="text-2xl font-bold tabular-nums text-primary">{s.value}</p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 space-y-6">
              {results.map((r, i) => (
                <div key={r.slide.id}>
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Trang {i + 1} · {r.slide.title}</span>
                    <span>
                      {r.valid} mẫu · nhìn vào trang {r.onSlide}%
                    </span>
                  </div>
                  <HeatmapCanvas src={r.slide.src} title={r.slide.title} points={r.points} />
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button variant="outline" onClick={reset}>
                <RiRefreshLine />
                Làm lại từ đầu
              </Button>
              <Link href="/account/login" className={cn(buttonVariants())}>
                Đăng nhập để dùng đầy đủ
                <RiArrowRightLine data-icon="inline-end" />
              </Link>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}