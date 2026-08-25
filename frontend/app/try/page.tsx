// app/try/page.tsx — Trang dùng thử cho khách (không cần đăng nhập):
// calibration → xem slide mẫu → heatmap tính local. Chi tiết: components/try/try-flow.tsx.
import TryFlow from '@/components/try/try-flow';

export const metadata = {
  title: 'Dùng thử — GazeEdu',
};

export default function Page() {
  return <TryFlow />;
}
