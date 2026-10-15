import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PreflightCheck } from "@/components/student/preflight-check";
import { FullPageSpinner } from "@/components/ui/spinner";

export default async function PreparePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return (
    <AppShell role="student">
      <Suspense fallback={<FullPageSpinner label="Đang chuẩn bị..." />}>
        <PreflightCheck courseId={courseId} />
      </Suspense>
    </AppShell>
  );
}
