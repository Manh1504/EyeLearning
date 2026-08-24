'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/brand-logo';
import {
  RiEyeLine,
  RiGroupLine,
  RiGraduationCapLine,
  RiCheckboxCircleLine,
  RiPlayLine,
  RiFireLine,
  RiArrowRightLine,
  RiMenuLine,
  RiCloseLine,
  RiBarChartLine,
  RiCameraLine,
  RiLockLine,
} from '@remixicon/react';

/* ============================================================
   GazeEdu — Landing Page (v5.1)
   Fix khoảng trắng Hero → Giải pháp:
   - Hero: giảm padding đáy pb-24/lg:pb-36 → pb-16/lg:pb-24
   - <Section /> nhận prop `padding` để override khi cần
   - Giải pháp: padding đỉnh riêng pt-16/lg:pt-24 (thay vì 32)
     + border-t mảnh tạo điểm neo thị giác giữa 2 section
   Tổng khoảng nghỉ Hero→Giải pháp: 272px → 192px (desktop)
   ============================================================ */

const roleDetails = {
  student: {
    title: 'Dành cho Học viên',
    desc: 'Truy cập khóa học, đọc tài liệu PDF và theo dõi tiến độ học tập trong một giao diện rõ ràng.',
    points: [
      'Truy cập các khóa học đã được phân quyền.',
      'Đọc bài học PDF trong luồng học tập có ghi nhận điểm nhìn.',
      'Theo dõi tiến độ học theo từng bài và từng trang tài liệu.',
    ],
    badge: 'Theo dõi tiến độ học',
  },
  teacher: {
    title: 'Dành cho Giảng viên',
    desc: 'Quản lý khóa học, học viên và xem dữ liệu quan sát theo từng bài học, từng trang tài liệu.',
    points: [
      'Quản lý nội dung khóa học và cấu trúc bài học.',
      'Quản lý danh sách học viên trong từng khóa học.',
      'Xem heatmap và dữ liệu gaze theo bài học, từng trang PDF.',
    ],
    badge: 'Quan sát dữ liệu lớp học',
  },
} as const;

type Role = keyof typeof roleDetails;

const steps = [
  {
    icon: RiCameraLine,
    title: 'Kiểm tra webcam',
    desc: 'Người học cho phép webcam và thực hiện hiệu chỉnh để hệ thống ước lượng điểm nhìn phù hợp với màn hình.',
  },
  {
    icon: RiEyeLine,
    title: 'Đọc tài liệu PDF',
    desc: 'Trong quá trình học, hệ thống ghi nhận tọa độ điểm nhìn theo từng trang tài liệu PDF.',
  },
  {
    icon: RiBarChartLine,
    title: 'Xem heatmap',
    desc: 'Giảng viên xem heatmap và dữ liệu quan sát để hiểu cách học viên tương tác với nội dung.',
  },
];

const solutions = [
  {
    icon: RiEyeLine,
    title: 'Ước lượng điểm nhìn',
    desc: 'Sử dụng webcam để ước lượng tọa độ điểm nhìn của người học trong phiên đọc tài liệu.',
  },
  {
    icon: RiFireLine,
    title: 'Heatmap theo trang PDF',
    desc: 'Tổng hợp dữ liệu gaze thành bản đồ nhiệt trên từng trang PDF để giảng viên xem vùng nội dung được quan sát nhiều.',
  },
  {
    icon: RiBarChartLine,
    title: 'Phân tích theo trang',
    desc: 'Phân tích hành vi xem nội dung theo bài học và từng trang, hỗ trợ giảng viên theo dõi quá trình học.',
  },
];

const navLinks: Array<[string, string]> = [
  ['Giải pháp', '#solutions'],
  ['Cách hoạt động', '#how-it-works'],
  ['Dành cho ai?', '#roles'],
];

function Section({
  id,
  className = '',
  padding = 'py-24 lg:py-32',
  children,
}: {
  id?: string;
  className?: string;
  padding?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-24 ${padding} ${className}`}>
      {children}
    </section>
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-primary selection:text-white font-sans antialiased">
      <style>{`
        html { scroll-behavior: smooth; }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .animate-float { animation: float 5s ease-in-out infinite; }
        .animate-float-delayed { animation: float 6s ease-in-out 1.4s infinite; }
        .animate-fade-up { animation: fade-up .45s ease both; }
      `}</style>

      <header
        className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-all duration-300 ${
          scrolled
            ? 'bg-white/90 border-slate-200 shadow-sm'
            : 'bg-white/60 border-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between relative">
          <Link href="/" className="flex h-10 items-center" aria-label="GazeEdu">
            <BrandLogo variant="icon" className="h-9 sm:hidden" priority />
            <BrandLogo variant="light" className="hidden h-9 sm:block" priority />
          </Link>

          <nav className="hidden md:flex items-center space-x-8 absolute left-1/2 -translate-x-1/2">
            {navLinks.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="text-sm font-medium text-slate-600 hover:text-primary transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center justify-end space-x-2">
            <Link href="/account/login" className="hidden sm:inline-flex px-3 py-2 text-sm font-medium text-slate-600 hover:text-primary hover:bg-accent rounded-lg transition-colors">
              Đăng nhập
            </Link>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Mở menu"
            >
              {mobileOpen ? <RiCloseLine className="w-5 h-5" /> : <RiMenuLine className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-6 py-4 space-y-1 animate-fade-up">
            {navLinks.map(([label, href]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-accent hover:text-primary"
              >
                {label}
              </a>
            ))}
            <div className="flex gap-2 pt-2">
              <Link href="/account/login" className="flex-1 text-sm font-medium px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700">
                Đăng nhập
              </Link>
            </div>
          </div>
        )}
      </header>

      <section className="relative overflow-hidden pt-16 pb-16 lg:pt-24 lg:pb-24">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_60%,transparent_100%)]" />
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-cyan/15 blur-3xl" />
          <div className="absolute top-40 -left-32 w-80 h-80 rounded-full bg-brand-cyan/10 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="text-left max-w-2xl">
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight text-slate-900 leading-[1.08]">
                Biết người học đang nhìn vào đâu{' '}
                <span className="text-primary underline decoration-brand-cyan decoration-4 underline-offset-8">
                  trên từng trang tài liệu
                </span>
              </h1>

              <p className="mt-6 text-lg text-slate-600 leading-relaxed max-w-lg">
                GazeEdu sử dụng webcam để ước lượng điểm nhìn và tổng hợp dữ liệu quan sát
                theo từng trang PDF, giúp giảng viên xem heatmap và hỗ trợ người học hiệu quả hơn.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Link href="/account/login" className="group px-7 py-3.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-brand-navy/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-navy/25">
                  <span>Đăng nhập để trải nghiệm</span>
                  <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
                {[
                  'Không cần cài đặt',
                  'Chạy trên mọi trình duyệt hiện đại',
                  'Phân tích theo từng trang PDF',
                ].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <RiCheckboxCircleLine className="w-4 h-4 text-brand-cyan" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
              <div className="absolute -inset-1 bg-gradient-to-tr from-brand-cyan/20 via-white to-brand-cyan/10 rounded-[2rem] transform rotate-2 scale-[1.03]" />

              <div className="relative rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-slate-900/10 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <div className="ml-3 flex-1 h-6 rounded-md bg-white border border-slate-200 text-[10px] flex items-center px-2.5 text-slate-400 font-mono">
                    app.gazeedu.vn/classroom
                  </div>
                </div>

                <div className="relative bg-slate-50 aspect-[4/3] sm:aspect-video flex flex-col justify-between p-4 sm:p-6">
                  <div className="flex justify-between items-center text-xs">
                    <span className="flex items-center space-x-2 font-medium text-slate-700 bg-white px-2.5 py-1.5 rounded-lg shadow-sm border border-slate-100">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Đang ghi nhận điểm nhìn</span>
                    </span>
                  </div>

                  <div className="relative flex items-center justify-center flex-1 my-4">
                    <div className="absolute left-[30%] top-[35%] -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
                      <div className="w-16 h-16 rounded-full bg-brand-cyan/15 animate-ping absolute inset-0" />
                      <div className="w-8 h-8 rounded-full border-2 border-brand-cyan bg-brand-cyan/20 flex items-center justify-center shadow-[0_0_15px_rgba(1,188,234,0.45)]">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      </div>
                      <span className="absolute left-10 top-0 text-[10px] font-mono bg-slate-900 text-white px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
                        x:540 y:320
                      </span>
                    </div>

                    <div className="text-center p-6 bg-white rounded-xl border border-slate-200 shadow-sm w-full max-w-xs relative overflow-hidden group cursor-pointer hover:border-brand-cyan/60 transition-colors">
                      <div className="w-12 h-12 mx-auto rounded-full bg-accent text-primary flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-white transition-colors">
                        <RiPlayLine className="w-5 h-5 ml-0.5" />
                      </div>
                      <p className="text-sm font-bold text-slate-800 line-clamp-1">
                        Thuật toán Gradient Descent
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Trang PDF mẫu</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-brand-cyan to-primary w-[65%] rounded-full" />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">12 / 18 trang</span>
                  </div>
                </div>
              </div>

              <div className="absolute -right-4 sm:-right-8 top-8 animate-float">
                <div className="bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-900/10 p-3.5 w-40">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-accent text-primary flex items-center justify-center">
                      <RiEyeLine className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700">Tiến độ trang</span>
                  </div>
                  <div className="flex items-end gap-1 h-8">
                    {[40, 65, 50, 80, 70, 94, 88].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-sm bg-gradient-to-t from-primary to-brand-cyan"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="absolute -left-4 sm:-left-10 bottom-10 animate-float-delayed">
                <div className="bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-900/10 p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center">
                    <RiFireLine className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-800">Heatmap trang PDF</p>
                    <p className="text-[10px] text-slate-500">Tổng hợp theo trang</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section
        id="solutions"
        className="bg-white border-t border-slate-200/70"
        padding="pt-16 pb-24 lg:pt-24 lg:pb-32"
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-16 lg:mb-20">
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">
              Giải pháp
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
              Công nghệ thị giác, đơn giản hóa cho lớp học
            </h2>
            <p className="mt-4 text-slate-600 text-lg">
              Hỗ trợ giảng viên hiểu cách học viên quan sát nội dung PDF qua dữ liệu gaze.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {solutions.map((f) => (
              <div
                key={f.title}
                className="group relative p-8 rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-brand-navy/5 hover:-translate-y-1 hover:border-brand-cyan/30 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-cyan to-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-3 rounded-2xl bg-accent border border-brand-cyan/30 text-primary inline-flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                  <f.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{f.title}</h3>
                <p className="text-slate-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section id="how-it-works" className="bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 lg:mb-20">
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">
              Cách hoạt động
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
              Từ webcam đến heatmap theo trang
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-10 relative">
            <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px bg-gradient-to-r from-brand-cyan/20 via-brand-cyan to-brand-cyan/20" />
            {steps.map((s, i) => (
              <div key={s.title} className="relative text-center">
                <div className="relative inline-flex">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-brand-cyan/30 shadow-lg shadow-brand-navy/5 text-primary flex items-center justify-center">
                    <s.icon className="w-7 h-7" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-bold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-slate-600 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section id="roles" className="bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12 lg:mb-16">
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">
              Đối tượng
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
              Trải nghiệm chuyên biệt
            </h2>
            <p className="mt-4 text-slate-600 text-lg">
              Quy trình tối ưu cho cả người học và người dạy.
            </p>

            <div className="mt-8 inline-flex p-1.5 rounded-xl bg-white border border-slate-200 shadow-sm">
              {(['student', 'teacher'] as Role[]).map((role) => (
                <button
                  key={role}
                  onClick={() => setActiveTab(role)}
                  className={`px-8 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                    activeTab === role
                      ? 'bg-primary text-white shadow-md shadow-brand-navy/20'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {role === 'student' ? 'Học viên' : 'Giảng viên'}
                </button>
              ))}
            </div>
          </div>

          <div
            key={activeTab}
            className="animate-fade-up p-8 sm:p-12 rounded-[2rem] bg-white border border-slate-200 shadow-xl shadow-slate-900/5 relative overflow-hidden"
          >
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-brand-cyan/10 blur-3xl pointer-events-none" />
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-12">
              <div className="space-y-6 max-w-lg flex-1">
                <span className="inline-flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-accent border border-brand-cyan/30 text-primary">
                  {roleDetails[activeTab].badge}
                </span>
                <h3 className="text-3xl font-extrabold text-slate-900">
                  {roleDetails[activeTab].title}
                </h3>
                <p className="text-lg text-slate-600 leading-relaxed">
                  {roleDetails[activeTab].desc}
                </p>
                <div className="pt-2 space-y-4">
                  {roleDetails[activeTab].points.map((pt, idx) => (
                    <div key={idx} className="flex items-start space-x-3 text-slate-700">
                      <RiCheckboxCircleLine className="w-6 h-6 text-brand-cyan shrink-0" />
                      <span className="text-base leading-snug">{pt}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full md:w-80 shrink-0 rounded-2xl bg-slate-50 border border-slate-200 p-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-brand-cyan-muted/70 to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center shadow-md shadow-brand-navy/20">
                      {activeTab === 'student' ? (
                        <RiGraduationCapLine className="w-6 h-6" />
                      ) : (
                        <RiGroupLine className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {activeTab === 'student' ? 'Tiến độ học tập' : 'Tổng quan lớp học'}
                      </p>
                      <p className="text-xs text-slate-500">Giao diện minh họa</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {[67, 72, 94].map((w, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-[10px] font-medium text-slate-400">
                          <span>
                            {activeTab === 'student' ? `Bài ${i + 1}` : `Trang ${i + 1}`}
                          </span>
                          <span>{activeTab === 'student' ? `${i + 8}/${i + 12} trang` : `${w} mẫu gaze`}</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-cyan to-primary"
                            style={{ width: `${w}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section className="bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="relative rounded-[2rem] overflow-hidden bg-brand-dark p-10 sm:p-16 text-center text-white shadow-2xl shadow-brand-navy/25">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:3rem_3rem] pointer-events-none" />
            <div className="relative max-w-2xl mx-auto">
              <BrandLogo variant="dark" className="mx-auto mb-6 h-10" />
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Sẵn sàng nâng cao chất lượng
                <br className="hidden sm:block" /> dạy và học cho lớp học?
              </h2>
              <p className="mt-4 text-lg text-white/80">
                Đăng nhập để truy cập khóa học, đọc tài liệu PDF và xem dữ liệu heatmap.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/account/login" className="group w-full sm:w-auto px-8 py-4 rounded-xl bg-white text-primary font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
                  <span>Đăng nhập để trải nghiệm</span>
                  <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2 md:col-span-1">
            <BrandLogo variant="light" className="h-8" />
            <p className="mt-4 text-sm text-slate-500 leading-relaxed max-w-xs">
              Nền tảng học tập sử dụng webcam eye-tracking để phân tích hành vi quan sát
              trên từng trang tài liệu PDF.
            </p>
          </div>

          {[
            {
              heading: 'Sản phẩm',
              links: [
                ['Giải pháp', '#solutions'],
                ['Cách hoạt động', '#how-it-works'],
                ['Dành cho ai', '#roles'],
              ],
            },
            {
              heading: 'Tài khoản',
              links: [['Đăng nhập', '/account/login']],
            },
          ].map((col) => (
            <div key={col.heading}>
              <p className="text-sm font-bold text-slate-900 mb-4">{col.heading}</p>
              <ul className="space-y-2.5">
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    <a
                      href={href}
                      className="text-sm text-slate-500 hover:text-primary transition-colors"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100">
          <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <span>© {new Date().getFullYear()} GazeEdu. All rights reserved.</span>
            <span className="flex items-center gap-1.5">
              <RiLockLine className="w-3.5 h-3.5" />
              Phân tích hành vi quan sát theo từng trang tài liệu
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
