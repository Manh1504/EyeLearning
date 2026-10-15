"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalibrationStage } from "@/components/calibration/calibration-stage";
import { useCalibration } from "@/hooks/use-calibration";

export function CalibrationFlow({ courseId }: { courseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lessonId = searchParams.get("lesson");

  const engine = useCalibration({
    onComplete: () => {
      const q = lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : "";
      router.replace(`/student/courses/${courseId}${q}`);
    },
  });

  return (
    <main className="h-dvh w-full bg-[#111210]" aria-label="Không gian hiệu chỉnh điểm nhìn">
      <CalibrationStage engine={engine} />
    </main>
  );
}
