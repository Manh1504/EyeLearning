// app/student/(dashboard)/layout.tsx — Shell khu vực học viên (navbar).
import type { ReactNode } from 'react';
import { StudentShell } from '@/components/student/student-shell';

export default function StudentDashboardLayout({ children }: { children: ReactNode }) {
  return <StudentShell>{children}</StudentShell>;
}
