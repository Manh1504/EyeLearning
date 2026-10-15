import { AppShell } from "@/components/layout/app-shell";
import { CalibrationSettingsForm } from "@/components/admin/calibration-settings-form";

export default function AdminSettingsPage() {
  return (
    <AppShell
      role="admin"
      title="Cấu hình"
      description="Điều chỉnh ngưỡng hiệu chỉnh điểm nhìn cho toàn hệ thống."
    >
      <CalibrationSettingsForm />
    </AppShell>
  );
}
