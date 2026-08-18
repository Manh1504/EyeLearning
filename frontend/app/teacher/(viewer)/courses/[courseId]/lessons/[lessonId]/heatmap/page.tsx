// app/teacher/courses/[courseId]/lessons/[lessonId]/heatmap/page.tsx
import { Suspense } from 'react';
import HeatmapViewer from '@/components/teacher/heatmap-viewer';
export default function Page() {
  return <Suspense fallback={null}><HeatmapViewer /></Suspense>;
}