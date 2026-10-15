"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { CalibrationStage } from "@/components/calibration/calibration-stage";
import { HeatmapCanvas } from "@/components/heatmap/heatmap-canvas";
import { useGazeTracker } from "@/hooks/use-gaze-tracker";
import { useCalibration } from "@/hooks/use-calibration";
import { clearStoredGazeSession } from "@/lib/api/calibration";

const DEMO_SLIDES = [
  { id: "demo-1", title: "Gradient Descent — Trang bìa", src: "/demo/slide-1.svg" },
  { id: "demo-2", title: "Ý tưởng cốt lõi", src: "/demo/slide-2.svg" },
  { id: "demo-3", title: "Tốc độ học (learning rate)", src: "/demo/slide-3.svg" },
];

type Step = "intro" | "calibrate" | "view" | "result";

interface GazeRecord {
  slide: number;
  x: number;
  y: number;
}

const STEP_LABELS: Array<{ key: Step; label: string }> = [
  { key: "calibrate", label: "Hiệu chỉnh" },
  { key: "view", label: "Xem bài mẫu" },
  { key: "result", label: "Heatmap của bạn" },
];

function IntroStep({ onStart }: { onStart: () => void }) {
  const steps = [
    { icon: "ri-focus-2-line", title: "Hiệu chỉnh (16 điểm)", desc: "Nhìn vào từng chấm và bấm — mất khoảng 1 phút." },
    { icon: "ri-eye-line", title: "Xem 3 trang bài giảng mẫu", desc: "Hệ thống thu điểm nhìn trong lúc bạn xem." },
    { icon: "ri-bar-chart-line", title: "Nhận heatmap ngay", desc: "Bản đồ nhiệt tính tức thì từ dữ liệu vừa thu." },
  ];
  return (
    <main className="flex flex-1 items-center px-4 py-12 sm:px-6">
      <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <section>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f1e6] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#52704f]">
            <Icon name="ri-eye-line" className="size-3.5" />
            Phiên trải nghiệm 2 phút
          </span>
          <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl sm:leading-[1.05]">
            Xem cách ánh mắt tương tác với nội dung.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            Không cần tài khoản. Webcam ước lượng điểm nhìn khi bạn đọc ba trang mẫu, sau đó dựng heatmap ngay trên thiết bị.
          </p>
          <Button size="lg" onClick={onStart} className="mt-8 bg-black px-6 text-white shadow-xs hover:bg-[#292a27]">
            Bắt đầu hiệu chỉnh
            <Icon name="ri-arrow-right-line" className="size-5" />
          </Button>
          <p className="mt-5 flex max-w-lg items-start gap-2 text-xs leading-5 text-muted-foreground">
            <Icon name="ri-lock-line" className="mt-0.5 size-3.5 shrink-0" />
            Dữ liệu điểm nhìn chỉ tồn tại trong phiên trình duyệt này và không được ghi vào hệ thống.
          </p>
        </section>

        <ol className="rounded-[20px] border border-border/80 bg-white p-3 shadow-sm sm:p-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-4 rounded-2xl px-3 py-4 sm:px-4">
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-[#dce8d9] bg-[#e8f1e6] text-[#52704f]">
                <Icon name={s.icon} className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1 border-b border-border pb-4 last:border-0">
                <p className="text-xs font-medium text-muted-foreground">0{i + 1}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{s.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}

export function TryFlow() {
  const [step, setStep] = useState<Step>("intro");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [gazeDot, setGazeDot] = useState<{ x: number; y: number } | null>(null);
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
    enabled: step === "view",
    calibrated: true,
    onPoint: handlePoint,
    allowSimulation: false,
  });

  const results = useMemo(
    () =>
      DEMO_SLIDES.map((slide, i) => {
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
      }),
    [resultRecords],
  );

  const totalValid = useMemo(() => results.reduce((sum, r) => sum + r.valid, 0), [results]);

  const reset = () => {
    clearStoredGazeSession();
    gazeRef.current = [];
    setResultRecords([]);
    setValidCount(0);
    setGazeDot(null);
    setCurrentSlide(0);
    setStep("intro");
  };

  // ---- Calibration step uses shared engine ----
  if (step === "calibrate") {
    return <GuestCalibration onDone={() => setStep("view")} />;
  }

  const stepIndex = STEP_LABELS.findIndex((s) => s.key === step);

  return (
    <div className={`flex flex-col bg-[#f5f6f2] text-foreground ${step === "view" ? "h-dvh overflow-hidden" : "min-h-dvh"}`}>
      <header className="z-40 shrink-0 px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between rounded-full border border-border/80 bg-white px-3 shadow-xs sm:px-4">
          <Link
            href="/account/login"
            className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icon name="ri-arrow-left-s-line" className="size-4" />
            Đăng nhập
          </Link>

          <div className="hidden items-center gap-1.5 sm:flex">
            {STEP_LABELS.map((s, i) => (
              <span key={s.key} className="flex items-center gap-2">
                <span
                  className={`flex size-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                    i <= stepIndex ? "bg-black text-white" : "bg-[#e8f1e6] text-[#52704f]"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`text-[11px] font-medium ${i <= stepIndex ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
                {i < STEP_LABELS.length - 1 && <span className="h-px w-4 bg-border" />}
              </span>
            ))}
          </div>

          <span className="rounded-full bg-[#e8f1e6] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#52704f]">Khách</span>
        </div>
      </header>

      {step === "intro" && <IntroStep onStart={() => setStep("calibrate")} />}

      {step === "view" && (
        <main className="relative m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-border/80 bg-[#fffffb] shadow-xs sm:m-3">
          <div className="z-10 shrink-0 px-4 py-3 sm:px-5">
            <div className="mx-auto flex max-w-[1200px] items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-muted-foreground">Bài mẫu · Gradient Descent</p>
                <h1 className="mt-0.5 truncate text-sm font-medium">
                  {DEMO_SLIDES[currentSlide].title}
                </h1>
              </div>
              <div className="shrink-0 rounded-full bg-muted px-3 py-1.5">
                <p className="text-xs font-medium tabular-nums">
                  {currentSlide + 1}
                  <span className="font-normal text-muted-foreground"> / {total}</span>
                </p>
              </div>
              {gazeSource === "real" ? (
                <span className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium sm:flex">
                  <span className="size-1.5 animate-pulse rounded-full bg-[#789472]" />
                  Gaze hoạt động
                </span>
              ) : (
                <span className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground sm:flex">
                  <span className="size-1.5 rounded-full bg-muted-foreground" />
                  Gaze chưa kết nối
                </span>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-center overflow-auto bg-[#f9f9f5] px-3 pb-20 pt-3 sm:px-5">
            <div className="mx-auto w-full max-w-[min(1040px,calc((100dvh-10rem)*16/9))]">
              <div className="relative aspect-video overflow-hidden rounded-[18px] border border-border/80 bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={DEMO_SLIDES[currentSlide].src}
                  alt={DEMO_SLIDES[currentSlide].title}
                  className="absolute inset-0 block h-full w-full bg-white object-contain"
                />
              </div>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Đọc tự nhiên. Điểm nhìn đang được ghi nhận trong phiên này.
              </p>
              {gazeSource === "off" && (
                <p className="mx-auto mt-2 rounded-xl bg-muted px-3 py-2 text-center text-xs font-medium text-foreground">
                  Chưa kết nối được camera hoặc dịch vụ theo dõi — kiểm tra camera rồi tải lại trang. Heatmap sẽ
                  trống nếu không có dữ liệu điểm nhìn.
                </p>
              )}
            </div>
          </div>

          <footer className="absolute inset-x-0 bottom-3 z-20 px-3 sm:bottom-4">
            <div className="mx-auto flex max-w-xl items-center gap-2 rounded-full border border-border/80 bg-white/95 p-1.5 shadow-md backdrop-blur-md">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentSlide((v) => Math.max(0, v - 1))}
                disabled={currentSlide === 0}
              >
                <Icon name="ri-arrow-left-s-line" className="size-4" />
                <span className="hidden sm:inline">Trang trước</span>
              </Button>
              <div className="flex min-w-0 flex-1 items-center gap-3 px-1 sm:px-3">
                <Progress
                  value={((currentSlide + 1) / total) * 100}
                  className="h-1 flex-1"
                  indicatorClassName="bg-[#789472]"
                />
              </div>
              {currentSlide < total - 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentSlide((v) => Math.min(total - 1, v + 1))}
                >
                  <span className="hidden sm:inline">Trang sau</span>
                  <Icon name="ri-arrow-right-s-line" className="size-4" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setResultRecords([...gazeRef.current]);
                    setStep("result");
                  }}
                  disabled={validCount === 0}
                >
                  <Icon name="ri-bar-chart-line" className="size-4" />
                  Xem kết quả
                </Button>
              )}
            </div>
          </footer>

          {gazeDot && (
            <div className="pointer-events-none fixed inset-0 z-30">
              <span
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black shadow-[0_1px_5px_rgba(0,0,0,0.2)]"
                style={{ left: `${gazeDot.x * 100}%`, top: `${gazeDot.y * 100}%` }}
              />
            </div>
          )}
        </main>
      )}

      {step === "result" && (
        <main className="flex-1 px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-[1000px]">
            <div className="mx-auto max-w-xl text-center">
              <p className="inline-flex rounded-full bg-[#e8f1e6] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#52704f]">Kết quả phiên thử</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground">
                Heatmap điểm nhìn
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Vùng màu đỏ là nơi bạn nhìn lâu nhất, xanh là nơi nhìn ít hơn.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-2 rounded-[20px] border border-border/80 bg-white p-2 shadow-sm sm:grid-cols-3">
              {[
                { label: "Tổng mẫu điểm nhìn", value: String(totalValid) },
                { label: "Số trang đã xem", value: `${results.filter((r) => r.total > 0).length}/${total}` },
                {
                  label: "Tỷ lệ nhìn vào trang",
                  value: `${totalValid ? Math.round((results.reduce((s, r) => s + r.valid, 0) / Math.max(1, results.reduce((s, r) => s + r.total, 0))) * 100) : 0}%`,
                },
              ].map((s) => (
                <div key={s.label} className="rounded-[16px] bg-[#f5f6f2] p-5 text-center">
                  <p className="text-2xl font-semibold tabular-nums text-foreground">{s.value}</p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 space-y-8">
              {results.map((r, i) => (
                <div key={r.slide.id}>
                  <div className="mb-3 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-semibold text-foreground">
                      Trang {i + 1} · {r.slide.title}
                    </span>
                    <span>
                      {r.valid} mẫu · nhìn vào trang {r.onSlide}%
                    </span>
                  </div>
                  <HeatmapCanvas src={r.slide.src} title={r.slide.title} points={r.points} />
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button variant="outline" onClick={reset}>
                <Icon name="ri-loader-4-line" className="hidden" />
                Làm lại từ đầu
              </Button>
              <Button asChild>
                <Link href="/account/login">
                  Đăng nhập để dùng đầy đủ
                  <Icon name="ri-arrow-right-line" className="size-5" />
                </Link>
              </Button>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

function GuestCalibration({ onDone }: { onDone: () => void }) {
  const engine = useCalibration({
    onComplete: onDone,
    persistToBackend: false,
  });
  return <CalibrationStage engine={engine} />;
}
