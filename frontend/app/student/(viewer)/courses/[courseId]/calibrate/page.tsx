// app/student/(viewer)/courses/[courseId]/calibrate/page.tsx
// Hiệu chỉnh mắt trước khi vào học bài. Sau khi xong → course-learning (/student/courses/[courseId]).
import { Suspense } from 'react';
import Calibration from '@/components/student/calibration';

export default function Page() {
  return <Suspense fallback={null}><Calibration /></Suspense>;
}
