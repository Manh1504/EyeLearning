"use client";

import { Progress } from "@/components/ui/progress";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { CalibrationEngine } from "@/hooks/use-calibration";

export function CalibrationStage({ engine }: { engine: CalibrationEngine }) {
  const { current, step, total, phase, busy, error, progress, attachVideo, handleDotClick } = engine;

  return (
    <div className="relative h-dvh overflow-hidden bg-[#111210] text-white">
      <video
        ref={attachVideo}
        autoPlay
        playsInline
        muted
        aria-hidden="true"
        className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0"
      />

      {(phase === "calibrating" || phase === "sending" || phase === "idle") && (
        <button
          type="button"
          onClick={handleDotClick}
          disabled={busy}
          aria-label={`Điểm hiệu chỉnh ${step + 1}/${total}`}
          className="group absolute z-20 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-white/30 disabled:cursor-default sm:size-16"
          style={{ left: `${current.x * 100}%`, top: `${current.y * 100}%` }}
        >
          <span className="absolute inset-0 rounded-full border border-white/20 bg-white/5 transition group-hover:bg-white/10" />
          <span
            className={cn(
              "absolute inset-2 rounded-full border border-white/30 bg-white/10 transition",
              busy && "animate-pulse",
            )}
          />
          <span
            className={cn(
              "relative size-4 rounded-full border-2 border-black bg-white ring-2 ring-white transition sm:size-5",
              busy ? "animate-pulse" : "group-hover:scale-110",
            )}
          />
        </button>
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 z-30 flex justify-center p-3 sm:p-5",
          current.y < 0.5 ? "bottom-0" : "top-0",
        )}
      >
         <div className="w-full max-w-xl rounded-[20px] border border-white/10 bg-[#111210]/85 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-black">
              <Icon name="ri-focus-2-line" className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">Hiệu chỉnh điểm nhìn</p>
                <span className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white/70">
                  {Math.min(step + 1, total)} / {total}
                </span>
              </div>
              <Progress
                value={progress}
                className="mt-2 h-1 bg-white/15"
                indicatorClassName="bg-white"
              />
            </div>
          </div>

          {phase === "training" ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 flex items-center gap-2 text-xs text-white/65"
            >
              <Spinner className="text-white" />
              Đang huấn luyện bộ hiệu chỉnh…
            </p>
          ) : (
            <p className="mt-3 pl-11 text-xs leading-5 text-white/60">
              Giữ mắt tại chấm trắng, bấm một lần và tiếp tục nhìn cho đến khi chấm kế tiếp xuất hiện.
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-white"
            >
              {error}
            </p>
          )}

          {!engine.camOn && (
            <p className="mt-3 pl-11 text-xs text-white/70">
              Camera chưa sẵn sàng. Hãy cấp quyền camera rồi thử lại.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
