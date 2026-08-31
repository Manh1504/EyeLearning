'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  RiEyeLine,
  RiGroupLine,
  RiGraduationCapLine,
  RiCheckboxCircleLine,
  RiArrowRightLine,
  RiFireLine,
  RiMenuLine,
  RiCloseLine,
  RiBarChartLine,
  RiCameraLine,
  RiNotification3Line,
} from '@remixicon/react';

import { BrandLogo } from '@/components/ui/brand-logo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ============================================================
   GazeEdu — Landing Page
   Thế giới thị giác: nền trắng, cấu trúc navy, một accent cyan dành
   riêng cho trạng thái tương tác / nhấn. Không gradient, không glass,
   không trang trí vô nghĩa — nội dung tự biện minh cho chỗ đứng.
   ============================================================ */

const roleDetails = {
  student: {
    title: 'Dành cho Học sinh',
    desc: 'Trải nghiệm học tập cá nhân hóa, đo lường và cải thiện độ tập trung tức thì.',
    points: [
      'Đăng ký khóa học và nhận thông báo duyệt nhanh chóng từ giảng viên.',
      'Nhận báo trực quan về mức độ chú ý qua từng bài giảng video.',
      'Tối ưu lộ trình ôn tập dựa trên các đoạn kiến thức chưa tập trung.',
    ],
    badge: 'Tối ưu tiếp thu',
    panelTitle: 'Báo cáo cá nhân',
  },
  teacher: {
    title: 'Dành cho Giảng viên',
    desc: 'Quản lý lớp học thông minh và thấu hiểu hành vi học viên qua dữ liệu thực tế.',
    points: [
      'Phê duyệt học viên tham gia khóa học linh hoạt chỉ với 1 cú nhấp.',
      'Xem bản đồ nhiệt (Heatmap) điểm nhìn để biết học sinh gặp khó ở phân đoạn nào.',
      'Đăng tải và tổ chức bài giảng dễ dàng với hệ thống bài tập tương tác.',
    ],
    badge: 'Nâng cao chất lượng dạy',
    panelTitle: 'Tổng quan lớp học',
  },
} as const;

type Role = keyof typeof roleDetails;

const solutions = [
  {
    icon: RiEyeLine,
    title: 'Nhận diện điểm nhìn',
    desc: 'Mô hình AI xác định tọa độ và chuyển động đồng tử qua webcam thường, đánh giá chính xác mức độ tập trung trong suốt phiên học.',
  },
  {
    icon: RiFireLine,
    title: 'Heatmap bài giảng',
    desc: 'Bản đồ nhiệt trực quan trên từng khung hình video — giảng viên thấy ngay nội dung nào thu hút, đoạn nào cần tối ưu lại.',
  },
  {
    icon: RiNotification3Line,
    title: 'Cảnh báo mất tập trung',
    desc: 'Phát hiện trạng thái mất chú ý theo thời gian thực và nhắc nhẹ nhàng, giúp học viên quay lại bài giảng đúng lúc.',
  },
];

const steps = [
  {
    icon: RiCameraLine,
    title: 'Bật webcam',
    desc: 'Chỉ cần cho phép truy cập camera — không cài đặt, không thiết bị chuyên dụng.',
  },
  {
    icon: RiEyeLine,
    title: 'AI phân tích thời gian thực',
    desc: 'Mô hình gaze estimation xác định tọa độ điểm nhìn (x, y) ngay trên trình duyệt.',
  },
  {
    icon: RiBarChartLine,
    title: 'Nhận báo cáo & heatmap',
    desc: 'Độ tập trung theo từng phút và bản đồ nhiệt trực quan cho từng bài giảng.',
  },
];

const navLinks: Array<[string, string]> = [
  ['Giải pháp', '#solutions'],
  ['Cách hoạt động', '#how-it-works'],
  ['Dành cho ai?', '#roles'],
];

const trustItems = [
  'Không cần cài đặt',
  'Chạy trên mọi trình duyệt hiện đại',
  'Không thu thập video webcam',
];

// Bảng màu heatmap (khớp heatColor dùng trong sản phẩm) cho minh họa hero.
const HEAT_LEGEND = ['#2f5be8', '#3cb4fa', '#4fd782', '#fad23c', '#eb4632'];

/* ---------- Hình minh họa product (hero) — thể hiện đúng sản phẩm làm gì ---------- */

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" aria-hidden />
          <span className="ml-3 flex-1 truncate rounded-md border border-border bg-card px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
            app.gazeedu.vn/classroom
          </span>
        </div>

        {/* Reader + heatmap */}
        <div className="relative aspect-[16/10] bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/demo/slide-1.svg"
            alt="Trang bài giảng mẫu với bản đồ nhiệt điểm nhìn"
            className="absolute inset-0 h-full w-full object-contain"
          />
          <svg
            viewBox="0 0 800 450"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            <defs>
              <filter id="heat-blur" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="16" />
              </filter>
            </defs>
            <g filter="url(#heat-blur)" opacity="0.55">
              <circle cx="240" cy="150" r="78" fill="#eaffd9" />
              <circle cx="330" cy="120" r="64" fill="#c9f2b0" />
              <circle cx="430" cy="190" r="92" fill="#ffe27a" />
              <circle cx="540" cy="300" r="72" fill="#ff9b76" />
              <circle cx="590" cy="240" r="52" fill="#ff6a5c" />
            </g>
            <g opacity="0.9">
              <circle cx="430" cy="190" r="7" fill="#eb4632" />
              <circle cx="540" cy="300" r="6" fill="#fad23c" />
              <circle cx="240" cy="150" r="6" fill="#4fd782" />
              <circle cx="330" cy="120" r="5" fill="#3cb4fa" />
            </g>
          </svg>

          {/* Status pill */}
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            Eye Tracking Active
          </div>
          <div className="absolute right-3 top-3 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm">
            Độ chú ý: <span className="text-primary">94%</span>
          </div>
        </div>

        {/* Legend + progress */}
        <div className="space-y-3 border-t border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Mức tập trung</span>
            <span
              className="h-1.5 flex-1 rounded-full"
              style={{
                backgroundImage: `linear-gradient(to right, ${HEAT_LEGEND.join(', ')})`,
              }}
              aria-hidden
            />
            <span className="text-[11px] text-muted-foreground">Thấp</span>
            <span className="text-[11px] text-muted-foreground">Cao</span>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Tiến độ bài giảng</span>
              <span className="tabular-nums font-medium text-foreground">12:34 / 18:00</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[65%] rounded-full bg-brand-cyan" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LMSLandingPage() {
  const [activeTab, setActiveTab] = useState<Role>('student');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const role = roleDetails[activeTab];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <header
        className={cn(
          'sticky top-0 z-50 border-b transition-shadow',
          scrolled ? 'border-border bg-background shadow-card' : 'border-transparent bg-background',
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center" aria-label="GazeEdu — Trang chủ">
            <BrandLogo variant="light" className="h-8" priority />
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            {navLinks.map(([label, href]) => (
              <a key={href} href={href} className="transition-colors hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/account/login"
              className="hidden items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
            >
              Đăng nhập
            </Link>
            <Link href="/try" className={cn(buttonVariants(), 'hidden sm:inline-flex')}>
              Dùng thử
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <RiCloseLine className="h-5 w-5" /> : <RiMenuLine className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-border bg-background px-4 py-3 md:hidden">
            <nav className="flex flex-col">
              {navLinks.map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {label}
                </a>
              ))}
            </nav>
            <div className="mt-2 flex gap-2 border-t border-border pt-3">
              <Link
                href="/account/login"
                className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}
              >
                Đăng nhập
              </Link>
              <Link href="/try" className={cn(buttonVariants(), 'flex-1')}>
                Dùng thử
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Nền tảng E-Learning · Eye Tracking
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem]">
              Biết học viên đang nhìn đâu, hiểu học viên đang nghĩ gì.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Nền tảng E-Learning tích hợp AI phân tích độ tập trung theo thời gian thực —
              chỉ cần webcam có sẵn, xử lý hoàn toàn trên thiết bị.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/try" className={cn(buttonVariants({ size: 'lg' }))}>
                Trải nghiệm Demo miễn phí
                <RiArrowRightLine data-icon="inline-end" />
              </Link>
              <a
                href="#how-it-works"
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
              >
                Xem cách hoạt động
              </a>
            </div>

            <ul className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {trustItems.map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <RiCheckboxCircleLine className="h-4 w-4 text-primary" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <ProductPreview />
        </div>
      </section>

      {/* Giải pháp */}
      <section id="solutions" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Giải pháp
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Công nghệ thị giác, đơn giản hóa cho lớp học
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Nâng cao chất lượng dạy và học với phân tích điểm nhìn thời gian thực.
            </p>
          </div>

          <div className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
            {solutions.map((f) => (
              <div key={f.title} className="max-w-sm">
                <f.icon className="h-6 w-6 text-primary" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cách hoạt động */}
      <section id="how-it-works" className="scroll-mt-16 border-b border-border bg-muted/50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Cách hoạt động
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Chạy trong 30 giây, không cần cài đặt
            </h2>
          </div>

          <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
            {steps.map((s, i) => (
              <li key={s.title} className="max-w-sm">
                <span className="font-mono text-sm font-medium text-primary">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Dành cho ai? */}
      <section id="roles" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Đối tượng
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Trải nghiệm chuyên biệt
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Quy trình tối ưu cho cả người học và người dạy.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Chọn đối tượng"
            className="mt-8 inline-flex gap-1 rounded-lg border border-border bg-card p-1"
          >
            {(['student', 'teacher'] as Role[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  'rounded-md px-6 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25',
                  activeTab === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {key === 'student' ? 'Học sinh' : 'Giảng viên'}
              </button>
            ))}
          </div>

          <div className="mt-8 grid gap-8 rounded-xl border border-border bg-card p-6 sm:p-10 lg:grid-cols-2 lg:items-center">
            <div className="max-w-lg">
              <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                {role.badge}
              </span>
              <h3 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {role.title}
              </h3>
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{role.desc}</p>

              <ul className="mt-6 space-y-4">
                {role.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-3">
                    <RiCheckboxCircleLine className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span className="leading-snug text-foreground">{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-border bg-muted/40">
              <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  {activeTab === 'student' ? (
                    <RiGraduationCapLine className="h-5 w-5" aria-hidden />
                  ) : (
                    <RiGroupLine className="h-5 w-5" aria-hidden />
                  )}
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{role.panelTitle}</p>
                  <p className="text-xs text-muted-foreground">Giao diện minh họa</p>
                </div>
              </div>
              <div className="space-y-4 px-5 py-5">
                {[86, 72, 94].map((w, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{activeTab === 'student' ? `Buổi ${i + 1}` : `Lớp ${i + 1}`}</span>
                      <span className="tabular-nums font-medium text-foreground">{w}% chú ý</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-brand-cyan" style={{ width: `${w}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl">
            Sẵn sàng nâng cao chất lượng dạy và học cho lớp học?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-primary-foreground/80">
            Trải nghiệm nền tảng ngay hôm nay — miễn phí, không cần cài đặt, chỉ cần webcam có sẵn.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/try"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'w-full bg-white text-primary hover:bg-muted sm:w-auto',
              )}
            >
              Trải nghiệm Demo ngay
              <RiArrowRightLine data-icon="inline-end" />
            </Link>
            <Link
              href="/account/login"
              className={cn(
                buttonVariants({ size: 'lg', variant: 'outline' }),
                'w-full border-white/40 bg-transparent text-primary-foreground hover:bg-white/10 sm:w-auto',
              )}
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-1">
            <BrandLogo variant="light" className="h-8" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Nền tảng E-Learning phân tích độ tập trung bằng AI gaze tracking — riêng tư
              tuyệt đối, không cần thiết bị.
            </p>
          </div>

          {[
            { heading: 'Sản phẩm', links: ['Giải pháp', 'Cách hoạt động', 'Bảng giá', 'Demo'] },
            { heading: 'Tài nguyên', links: ['Tài liệu API', 'Nghiên cứu', 'Blog', 'Hỗ trợ'] },
            { heading: 'Pháp lý', links: ['Điều khoản', 'Cookie', 'Liên hệ'] },
          ].map((col) => (
            <div key={col.heading}>
              <p className="text-sm font-semibold text-foreground">{col.heading}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
            <span>© {new Date().getFullYear()} GazeEdu. All rights reserved.</span>
            <span className="flex items-center gap-1.5">
              <RiCheckboxCircleLine className="h-3.5 w-3.5 text-primary" aria-hidden />
              Xử lý on-device — không lưu video webcam
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}