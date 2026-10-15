import { Suspense } from "react";
import { FullPageSpinner } from "@/components/ui/spinner";
import { HeatmapViewer } from "@/components/teacher/heatmap-viewer";

export default async function HeatmapRoute({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  return (
    <Suspense fallback={<FullPageSpinner label="Đang tải phân tích..." />}>
      <HeatmapViewer courseId={courseId} lessonId={lessonId} />
    </Suspense>
  );
}
