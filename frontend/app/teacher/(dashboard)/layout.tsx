// app/teacher/(dashboard)/layout.tsx — Shell khu vực giảng viên (navbar).
// Các trang fullscreen (heatmap) nằm ở nhóm (viewer) để không bị bọc navbar.
import type { ReactNode } from 'react';
import { TeacherShell } from '@/components/teacher/teacher-shell';

export default function TeacherDashboardLayout({ children }: { children: ReactNode }) {
  return <TeacherShell>{children}</TeacherShell>;
}
