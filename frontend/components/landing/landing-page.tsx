'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
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
  RiNotification3Line,
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
    title: 'Dành cho Học sinh',
    desc: 'Trải nghiệm học tập cá nhân hóa, đo lường và cải thiện độ tập trung tức thì.',
    points: [
      'Đăng ký khóa học và nhận thông báo duyệt nhanh chóng từ giảng viên.',
      'Nhận báo trực quan về mức độ chú ý qua từng bài giảng video.',
      'Tối ưu lộ trình ôn tập dựa trên các đoạn kiến thức chưa tập trung.',
    ],
    badge: 'Tối ưu tiếp thu',
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
  },
} as const;

type Role = keyof typeof roleDetails;

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
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-cyan-700 selection:text-white font-sans antialiased">
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
          <Link href="/" className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-600 to-cyan-800 flex items-center justify-center text-white shadow-md shadow-cyan-700/20">
              <RiEyeLine className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">
              Gaze<span className="text-cyan-700">Edu</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center space-x-8 absolute left-1/2 -translate-x-1/2">
            {navLinks.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="text-sm font-medium text-slate-600 hover:text-cyan-700 transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center justify-end space-x-2">
            <Link href="/account/login" className="hidden sm:inline-flex px-3 py-2 text-sm font-medium text-slate-600 hover:text-cyan-700 hover:bg-slate-50 rounded-lg transition-colors">
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
                className="block px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-cyan-700"
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
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-cyan-200/40 blur-3xl" />
          <div className="absolute top-40 -left-32 w-80 h-80 rounded-full bg-teal-100/60 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="text-left max-w-2xl">
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight text-slate-900 leading-[1.08]">
                Biết học viên đang nhìn đâu,{' '}
                <span className="bg-gradient-to-r from-cyan-600 via-cyan-700 to-teal-600 bg-clip-text text-transparent">
                  hiểu học viên đang nghĩ gì
                </span>
              </h1>

              <p className="mt-6 text-lg text-slate-600 leading-relaxed max-w-lg">
                Nền tảng E-Learning tích hợp AI phân tích độ tập trung theo thời gian thực —
                chỉ cần webcam có sẵn, xử lý hoàn toàn trên thiết bị.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button className="group px-7 py-3.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-cyan-700/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-cyan-700/30">
                  <span>Trải nghiệm Demo miễn phí</span>
                  <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <button className="px-7 py-3.5 rounded-xl bg-white border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/50 text-slate-700 font-semibold flex items-center justify-center space-x-2 transition-all">
                  <span className="w-7 h-7 rounded-full bg-cyan-700 text-white flex items-center justify-center">
                    <RiPlayLine className="w-3.5 h-3.5 ml-0.5" />
                  </span>
                  <span>Xem video giới thiệu</span>
                </button>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
                {[
                  'Không cần cài đặt',
                  'Chạy trên mọi trình duyệt hiện đại',
                  'Không thu thập video webcam',
                ].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <RiCheckboxCircleLine className="w-4 h-4 text-cyan-600" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
              <div className="absolute -inset-1 bg-gradient-to-tr from-cyan-200/60 via-white to-teal-100/60 rounded-[2rem] transform rotate-2 scale-[1.03]" />

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
                      <span>Eye Tracking Active</span>
                    </span>
                    <span className="bg-white px-3 py-1.5 rounded-lg border border-slate-100 text-slate-700 shadow-sm font-semibold">
                      Độ chú ý: <span className="text-cyan-700">94%</span>
                    </span>
                  </div>

                  <div className="relative flex items-center justify-center flex-1 my-4">
                    <div className="absolute left-[30%] top-[35%] -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
                      <div className="w-16 h-16 rounded-full bg-cyan-500/15 animate-ping absolute inset-0" />
                      <div className="w-8 h-8 rounded-full border-2 border-cyan-500 bg-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.5)]">
                        <div className="w-2 h-2 rounded-full bg-cyan-700" />
                      </div>
                      <span className="absolute left-10 top-0 text-[10px] font-mono bg-slate-900 text-white px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
                        x:540 y:320
                      </span>
                    </div>

                    <div className="text-center p-6 bg-white rounded-xl border border-slate-200 shadow-sm w-full max-w-xs relative overflow-hidden group cursor-pointer hover:border-cyan-300 transition-colors">
                      <div className="w-12 h-12 mx-auto rounded-full bg-cyan-50 text-cyan-700 flex items-center justify-center mb-3 group-hover:bg-cyan-700 group-hover:text-white transition-colors">
                        <RiPlayLine className="w-5 h-5 ml-0.5" />
                      </div>
                      <p className="text-sm font-bold text-slate-800 line-clamp-1">
                        Thuật toán Gradient Descent
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Bài giảng mẫu</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-700 w-[65%] rounded-full" />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">12:34 / 18:00</span>
                  </div>
                </div>
              </div>

              <div className="absolute -right-4 sm:-right-8 top-8 animate-float">
                <div className="bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-900/10 p-3.5 w-40">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-cyan-50 text-cyan-700 flex items-center justify-center">
                      <RiEyeLine className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700">Tập trung</span>
                  </div>
                  <div className="flex items-end gap-1 h-8">
                    {[40, 65, 50, 80, 70, 94, 88].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-sm bg-gradient-to-t from-cyan-600 to-cyan-400"
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
                    <p className="text-[11px] font-semibold text-slate-800">Heatmap bài giảng</p>
                    <p className="text-[10px] text-slate-500">Cập nhật theo thời gian thực</p>
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
            <p className="text-sm font-bold uppercase tracking-widest text-cyan-700 mb-3">
              Giải pháp
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
              Công nghệ thị giác, đơn giản hóa cho lớp học
            </h2>
            <p className="mt-4 text-slate-600 text-lg">
              Nâng cao chất lượng dạy và học với phân tích điểm nhìn thời gian thực.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {solutions.map((f) => (
              <div
                key={f.title}
                className="group relative p-8 rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-cyan-900/5 hover:-translate-y-1 hover:border-cyan-200 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-3 rounded-2xl bg-cyan-50 border border-cyan-100 text-cyan-700 inline-flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-cyan-700 group-hover:text-white transition-all duration-300">
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
            <p className="text-sm font-bold uppercase tracking-widest text-cyan-700 mb-3">
              Cách hoạt động
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
              Chạy trong 30 giây, không cần cài đặt
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-10 relative">
            <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px bg-gradient-to-r from-cyan-200 via-cyan-400 to-cyan-200" />
            {steps.map((s, i) => (
              <div key={s.title} className="relative text-center">
                <div className="relative inline-flex">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-cyan-100 shadow-lg shadow-cyan-900/5 text-cyan-700 flex items-center justify-center">
                    <s.icon className="w-7 h-7" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-cyan-700 text-white text-xs font-bold flex items-center justify-center">
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
            <p className="text-sm font-bold uppercase tracking-widest text-cyan-700 mb-3">
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
                      ? 'bg-cyan-700 text-white shadow-md shadow-cyan-700/25'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {role === 'student' ? 'Học sinh' : 'Giảng viên'}
                </button>
              ))}
            </div>
          </div>

          <div
            key={activeTab}
            className="animate-fade-up p-8 sm:p-12 rounded-[2rem] bg-white border border-slate-200 shadow-xl shadow-slate-900/5 relative overflow-hidden"
          >
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-cyan-100/50 blur-3xl pointer-events-none" />
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-12">
              <div className="space-y-6 max-w-lg flex-1">
                <span className="inline-flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-cyan-50 border border-cyan-100 text-cyan-800">
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
                      <RiCheckboxCircleLine className="w-6 h-6 text-cyan-600 shrink-0" />
                      <span className="text-base leading-snug">{pt}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full md:w-80 shrink-0 rounded-2xl bg-slate-50 border border-slate-200 p-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-cyan-50/60 to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-11 h-11 rounded-xl bg-cyan-700 text-white flex items-center justify-center shadow-md shadow-cyan-700/25">
                      {activeTab === 'student' ? (
                        <RiGraduationCapLine className="w-6 h-6" />
                      ) : (
                        <RiGroupLine className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {activeTab === 'student' ? 'Báo cáo cá nhân' : 'Tổng quan lớp học'}
                      </p>
                      <p className="text-xs text-slate-500">Giao diện minh họa</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {[86, 72, 94].map((w, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-[10px] font-medium text-slate-400">
                          <span>
                            {activeTab === 'student' ? `Buổi ${i + 1}` : `Lớp ${i + 1}`}
                          </span>
                          <span>{w}% chú ý</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500"
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
          <div className="relative rounded-[2rem] overflow-hidden bg-gradient-to-br from-cyan-700 via-cyan-800 to-teal-900 p-10 sm:p-16 text-center text-white shadow-2xl shadow-cyan-900/30">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:3rem_3rem] pointer-events-none" />
            <div className="relative max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Sẵn sàng nâng cao chất lượng
                <br className="hidden sm:block" /> dạy và học cho lớp học?
              </h2>
              <p className="mt-4 text-lg text-cyan-100">
                Trải nghiệm nền tảng ngay hôm nay — miễn phí, không cần cài đặt,
                chỉ cần webcam có sẵn.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button className="group w-full sm:w-auto px-8 py-4 rounded-xl bg-white text-cyan-800 font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
                  <span>Trải nghiệm Demo ngay</span>
                  <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <Link href="/account/login" className="w-full sm:w-auto px-8 py-4 rounded-xl border border-white/30 text-white font-semibold hover:bg-white/10 transition-colors">
                  Đăng nhập
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-800 flex items-center justify-center text-white">
                <RiEyeLine className="w-4 h-4" />
              </div>
              <span className="font-bold text-lg text-slate-900">
                Gaze<span className="text-cyan-700">Edu</span>
              </span>
            </div>
            <p className="mt-4 text-sm text-slate-500 leading-relaxed max-w-xs">
              Nền tảng E-Learning phân tích độ tập trung bằng AI gaze tracking — riêng tư
              tuyệt đối, không cần thiết bị.
            </p>
          </div>

          {[
            {
              heading: 'Sản phẩm',
              links: ['Giải pháp', 'Cách hoạt động', 'Bảng giá', 'Demo'],
            },
            {
              heading: 'Tài nguyên',
              links: ['Tài liệu API', 'Nghiên cứu', 'Blog', 'Hỗ trợ'],
            },
            {
              heading: 'Pháp lý',
              links: ['Điều khoản', 'Cookie', 'Liên hệ'],
            },
          ].map((col) => (
            <div key={col.heading}>
              <p className="text-sm font-bold text-slate-900 mb-4">{col.heading}</p>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l}>
                    <a
                      href="#"
                      className="text-sm text-slate-500 hover:text-cyan-700 transition-colors"
                    >
                      {l}
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
              Xử lý on-device — không lưu video webcam
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
