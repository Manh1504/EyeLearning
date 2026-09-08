'use client';

// components/admin/calibration-settings.tsx — Admin chỉnh ngưỡng MAE hiệu chỉnh.

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  fetchAdminCalibrationSettings,
  updateAdminCalibrationSettings,
  formatMaePercent,
} from '@/lib/api/calibration';

export default function CalibrationSettings() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'calibration-settings'],
    queryFn: fetchAdminCalibrationSettings,
  });

  const [enabled, setEnabled] = useState(true);
  const [thresholdPct, setThresholdPct] = useState('12');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setThresholdPct(String(Math.round(data.threshold * 100)));
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () => {
      const v = Number(thresholdPct);
      if (Number.isNaN(v) || v < 1 || v > 30) throw new Error('Ngưỡng phải 1-30%');
      return updateAdminCalibrationSettings({ enabled, threshold: v / 100 });
    },
    onSuccess: (res) => {
      setSuccess(`Đã lưu: ${res.enabled ? `bật tính điểm, ngưỡng ${formatMaePercent(res.threshold)}` : 'tắt tính điểm (luôn pass)'}`);
      qc.invalidateQueries({ queryKey: ['admin', 'calibration-settings'] });
    },
  });

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-bold text-foreground">Cấu hình hiệu chỉnh điểm nhìn</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Áp dụng cho luồng học sinh. Luồng thử (guest) luôn cho qua không tính điểm.
      </p>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Đang tải cấu hình...</p>
      ) : isError ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(error as Error)?.message ?? 'Không tải được cấu hình'}
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          <label className="flex items-center gap-3 rounded-lg border border-border bg-muted px-3 py-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="flex-1">
              <span className="block text-sm font-medium text-foreground">Bật tính điểm MAE khi train</span>
              <span className="block text-xs text-muted-foreground">Tắt = học sinh luôn pass khi đủ mẫu, không kiểm tra độ lệch.</span>
            </span>
          </label>

          <div>
            <Label htmlFor="threshold">Ngưỡng cho phép (% màn hình)</Label>
            <div className="mt-2 flex items-center gap-3">
              <Input
                id="threshold"
                type="number"
                min={1}
                max={30}
                step={1}
                value={thresholdPct}
                onChange={(e) => setThresholdPct(e.target.value)}
                disabled={!enabled}
                className="max-w-[140px]"
                placeholder="12"
              />
              <span className="text-sm text-muted-foreground">% — ví dụ 12 = lệch trung bình cho phép 12% màn hình. Khuyến nghị 10-15% cho nhanh pass.</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Hiện tại: <span className="font-semibold text-foreground">{enabled ? formatMaePercent(Number(thresholdPct) / 100 || 0.12) : 'tắt tính điểm'}</span>
              {' · '}Mặc định mới 12% (trước 5% quá chặt).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={() => { setSuccess(''); mut.mutate(); }} disabled={mut.isPending}>
              {mut.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
            </Button>
            {success && <span className="text-sm font-medium text-emerald-600">{success}</span>}
          </div>

          {mut.isError && (
            <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {(mut.error as Error)?.message ?? 'Lưu thất bại'}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
