import { Suspense } from "react";
import { CalibrationFlow } from "@/components/calibration/calibration-flow";

export default async function CalibratePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return (
    <Suspense fallback={null}>
      <CalibrationFlow courseId={courseId} />
    </Suspense>
  );
}
