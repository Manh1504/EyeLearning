"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/icon";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useCalibrationSettings, useUpdateCalibrationSettings } from "@/hooks/use-admin";
import { formatMaePercent } from "@/lib/api/calibration";

export function CalibrationSettingsForm() {
  const { data, isLoading, isError, refetch } = useCalibrationSettings();
  const mutation = useUpdateCalibrationSettings();
  const [enabled, setEnabled] = useState(true);
  const [thresholdPercent, setThresholdPercent] = useState(12);
  const [hydrated, setHydrated] = useState(false);

  // Render-phase hydrate từ dữ liệu server (một lần).
  if (data && !hydrated) {
    setHydrated(true);
    setEnabled(data.enabled);
    setThresholdPercent(Math.round(data.threshold * 1000) / 10);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState title="Không tải được cấu hình" onRetry={() => refetch()} />;
  }

  const threshold = Math.min(30, Math.max(1, thresholdPercent)) / 100;

  return (
    <div className="grid max-w-4xl gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(240px,0.55fr)] lg:items-start">
      <section className="overflow-hidden rounded-[18px] border border-[#eeeee9] bg-white shadow-xs">
        <div className="flex items-start justify-between gap-4 border-b border-border/70 p-5 sm:p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Chính sách đánh giá</p>
            <h2 className="mt-2 text-lg font-bold tracking-[-0.025em] text-foreground">Tính điểm hiệu chỉnh</h2>
            <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
              Khi tắt, hệ thống bỏ qua ngưỡng MAE khi huấn luyện calibration.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
              enabled ? "border-primary bg-primary" : "border-border bg-muted"
            }`}
          >
            <span
               className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
                 enabled ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_140px] sm:items-end sm:p-6">
          <div>
            <Label htmlFor="threshold" className="text-xs">Ngưỡng MAE tối đa</Label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Chỉ chấp nhận phiên hiệu chỉnh có sai số nằm trong khoảng này.</p>
          </div>
          <div className="relative">
            <Input
            id="threshold"
            type="number"
            min={1}
            max={30}
            step={0.5}
            value={thresholdPercent}
            onChange={(e) => setThresholdPercent(Number(e.target.value))}
            disabled={!enabled}
            className="h-12 rounded-xl pr-10 text-right font-mono text-lg font-semibold"
          />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">%</span>
          </div>
        </div>

        <div className="mx-5 rounded-xl border border-[#dfe9dc] bg-[#e8f1e6] px-4 py-3 text-xs text-muted-foreground sm:mx-6">
          Giá trị quy đổi: <span className="font-mono font-semibold text-foreground">MAE ≤ {formatMaePercent(threshold)}</span>
          <span className="mx-2 text-border">/</span> Khoảng hợp lệ 1%–30%
        </div>

        <div className="flex flex-wrap gap-2 p-5 sm:p-6">
          <Button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ enabled, threshold })}
          >
            {mutation.isPending ? "Đang lưu…" : "Lưu cấu hình"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setEnabled(data.enabled);
              setThresholdPercent(Math.round(data.threshold * 1000) / 10);
              mutation.reset();
            }}
            disabled={mutation.isPending}
          >
            Khôi phục
          </Button>
        </div>

        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        {mutation.isSuccess && <Alert variant="success" title="Đã lưu cấu hình calibration" />}
        {mutation.isError && (
          <Alert variant="destructive" title="Không lưu được cấu hình">
            {mutation.error instanceof Error ? mutation.error.message : "Vui lòng thử lại."}
          </Alert>
        )}
        </div>
      </section>

      <section className="rounded-[18px] border border-[#dfe9dc] bg-[#e8f1e6] p-5 text-sm text-muted-foreground shadow-xs">
        <div className="flex items-center justify-between text-foreground">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Ghi chú vận hành</span>
          <Icon name="ri-information-line" className="size-4" />
        </div>
        <p className="mt-2 leading-6">
          Ngưỡng MAE càng thấp thì yêu cầu hiệu chỉnh càng chính xác nhưng người dùng có thể phải làm lại
          nhiều lần hơn. Giá trị khuyến nghị là 10%–15%.
        </p>
      </section>
    </div>
  );
}
