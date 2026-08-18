// app/teacher/courses/[courseId]/page.tsx
import { Suspense } from 'react';
import CourseWorkspace from '@/components/teacher/workspace/course-workspace';
export default function Page() {
  return <Suspense fallback={null}><CourseWorkspace /></Suspense>;
}