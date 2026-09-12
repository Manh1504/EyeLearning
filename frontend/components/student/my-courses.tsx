'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  RiArrowRightLine,
  RiBookOpenLine,
  RiEyeLine,
  RiSearchLine,
  RiCheckLine,
  RiTimeLine,
  RiFocus3Line,
  RiFireLine,
} from '@remixicon/react';

import { LEVEL_LABEL } from '@/lib/mock/student';
import { useMyEnrollments } from '@/hooks/use-student';
import type { EnrolledCourse } from '@/lib/types/domain';
import { cn } from '@/lib/utils';

type TabKey = 'all' | 'active' | 'completed';

function getCourseHref(e: EnrolledCourse) {
  return `/student/courses/${e.course.id}/prepare`;
}

function PassValue({ value, note }: { value: string; note?: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={note ?? 'Chưa có dữ liệu — sẽ phát triển thêm (pass)'}>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      {note && <span className="hidden sm:inline text-[10px] text-muted-foreground">· {note}</span>}
    </span>
  );
}

export default function MyCoursesPage() {
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');
  const { data: enrollments = [], isError, isLoading } = useMyEnrollments();

  const visible = useMemo(() => enrollments.filter((e) => e.status !== 'dropped'), [enrollments]);

  const counts = useMemo(() => {
    return {
      all: visible.length,
      active: visible.filter((e) => e.status === 'active').length,
      completed: visible.filter((e) => e.status === 'completed').length,
    };
  }, [visible]);

  const continueCourse = useMemo(
    () =>
      visible.find((e) => e.status === 'active' && e.progress > 0) ??
      visible.find((e) => e.status === 'active') ??
      visible[0],
    [visible],
  );

  const filtered = useMemo(() => {
    const kw = query.trim().toLocaleLowerCase('vi');
    return visible.filter((e) => {
      const okTab = tab === 'all' || e.status === tab;
      const okQ =
        !kw ||
        e.course.title.toLocaleLowerCase('vi').includes(kw) ||
        e.course.teacherName.toLocaleLowerCase('vi').includes(kw);
      return okTab && okQ;
    });
  }, [visible, tab, query]);

  const headerTotals = `${counts.all} Học phần`;

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6">
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Đang tải khóa học...</div>
      </main>
    );
  }
  if (isError) {
    return (
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6">
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-sm text-destructive">
          Không tải được danh sách khóa học.
        </div>
      </main>
    );
  }

  // Mock-derived display helpers — real gaze metrics chưa có -> hiển thị pass
  const hasGazeData = false; // TODO: nối GET /api/me/stats + gaze aggregates

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:py-8">
      {/* Breadcrumb + title row — khớp ảnh Main body layout */}
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-muted-foreground">Trang học viên</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-bold text-foreground">Khóa học của tôi</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">GET /api/me/enrollments</span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-3 text-[22px] font-bold leading-none tracking-tight text-[#0f2d5e] sm:text-[26px]">
              Khóa học của tôi
              <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">{headerTotals}</span>
            </h1>
            <p className="mt-2 max-w-[760px] text-sm leading-6 text-muted-foreground">
              Hệ thống tích hợp máy học thị giác phân tích chuyển động đồng tử, mật độ dừng mắt (Fixation) và chuỗi dịch chuyển
              (Saccades) thời gian thực theo chuẩn GazeEdu.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <label className="relative flex-1 sm:w-[320px]">
              <RiSearchLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm mã môn hoặc bài học..."
                className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </label>
            <Link
              href={continueCourse ? getCourseHref(continueCourse) : '#'}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-brand-cyan/30 bg-white px-4 text-sm font-semibold text-[#0b5f7a] shadow-sm hover:bg-accent"
            >
              <RiEyeLine className="h-4 w-4" /> Đo hiệu chuẩn nhanh (Calibrate)
            </Link>
          </div>
        </div>
      </div>

      {/* Continue + Sensor panel — 2 col layout từ ảnh */}
      {continueCourse ? (
        <section className="grid gap-6 pt-6 lg:grid-cols-[minmax(0,1.9fr)_380px]">
          {/* Continue card */}
          <article className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> ĐANG HỌC DỞ
              </span>
              <span className="text-xs text-muted-foreground">Lần cuối: — <span className="text-[11px]">(pass — cần lastActive từ BE)</span></span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                Gaze Tracker: {hasGazeData ? 'Tối ưu' : 'Chưa kết nối'}
              </span>
            </div>

            <div className="mt-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">CS402 · THỊ GIÁC MÁY TÍNH & TƯƠNG TÁC NGƯỜI-MÁY</p>
              <h2 className="mt-1 text-lg font-bold leading-snug text-[#102a4c] sm:text-xl line-clamp-2">{continueCourse.course.title}</h2>
              <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                Nghiên cứu hình học elip đồng tử, phản xạ giác mạc Purkinje và kiến trúc mạng CNN dự đoán tọa độ ảnh nhìn trên mặt phẳng tương tác.
                <span className="ml-1 text-xs text-muted-foreground/70">(mô tả mẫu — BE: courses.description)</span>
              </p>
            </div>

            <div className="mt-4 rounded-lg bg-muted/60 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Tiến độ bài học: — / — <span className="font-normal">(pass — cần lesson progress)</span></span>
                <span className="font-bold text-[#0b5f7a]">{continueCourse.progress}% HOÀN THÀNH</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-border">
                <div className="h-full rounded-full bg-brand-cyan" style={{ width: `${continueCourse.progress}%` }} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-muted-foreground">DỪNG MẮT TB (FIXATION) <RiTimeLine className="ml-auto h-3.5 w-3.5" /></p>
                <p className="mt-1 text-lg font-bold text-[#102a4c]"><PassValue value="—" note="pass - cần fixation TB" /> <span className="text-xs font-normal text-muted-foreground">giây / slide</span></p>
                <p className="text-xs font-medium text-emerald-600">—</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-muted-foreground">ĐIỂM CHÚ Ý (ATTENTION) <RiFocus3Line className="ml-auto h-3.5 w-3.5 text-brand-cyan" /></p>
                <p className="mt-1 text-lg font-bold text-[#102a4c]"><PassValue value="—" note="pass - cần attention score" /> <span className="text-xs font-normal text-muted-foreground">/ 100</span></p>
                <p className="text-xs text-muted-foreground">Mức độ tập trung —</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-muted-foreground">DỮ LIỆU NHIỆT MẮT <RiFireLine className="ml-auto h-3.5 w-3.5 text-purple-500" /></p>
                <p className="mt-1 text-lg font-bold text-[#102a4c]"><PassValue value="—" note="pass - cần heatmap points" /> <span className="text-xs font-normal text-muted-foreground">điểm</span></p>
                <p className="text-xs text-muted-foreground">Đã lưu heatmap phiên</p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <p className="flex-1 text-xs text-muted-foreground">Phiên học ghi nhận trực tiếp vào báo cáo định kỳ của Giảng viên.</p>
              <Link
                href={getCourseHref(continueCourse)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0f2d5e] px-4 text-sm font-semibold text-white hover:bg-[#143a78]"
              >
                Tiếp tục học ngay (Slide —) <RiArrowRightLine className="h-4 w-4" />
              </Link>
            </div>
          </article>

          {/* Sensor panel */}
          <aside className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold tracking-wide text-[#0f2d5e]">
              <RiFocus3Line className="h-4 w-4" /> KIỂM TRA CẢM BIẾN
              <span className="ml-auto rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">— ĐẠT</span>
            </h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Chuẩn hóa theo quy chuẩn ISO/TR 27500 về thu thập tín hiệu quang học & trắc diện mắt.</p>
            <div className="mt-4 space-y-3">
              {[
                { title: 'Camera', desc: '— (pass — cần device info)', ok: false },
                { title: 'Ánh sáng phòng đồng đều', desc: 'Cường độ — Lux (pass)', ok: false },
                { title: 'Hiệu chuẩn 9 điểm nhìn', desc: 'Sai số — RMS (pass — 2h hiệu lực)', ok: false },
              ].map((it) => (
                <div key={it.title} className="flex gap-3 rounded-lg border bg-muted/40 p-3">
                  <span className={cn('mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border', it.ok ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-white text-muted-foreground')}>
                    <RiCheckLine className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{it.title}</p>
                    <p className="text-xs text-muted-foreground">{it.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link href={getCourseHref(continueCourse)} className="mt-4 flex h-9 items-center justify-center gap-2 rounded-lg border bg-[#eef6ff] text-sm font-semibold text-[#0b5f7a] hover:bg-accent">
              <RiEyeLine className="h-4 w-4" /> Đo hiệu chuẩn nhanh (Calibrate)
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">Độ trễ: —ms <span className="text-[11px]">(pass)</span></p>
          </aside>
        </section>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Chưa có khóa học nào được ghi danh.</div>
      )}

      {/* All courses */}
      <section className="pt-8">
        <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
          <h2 className="text-lg font-bold text-[#0f2d5e]">Tất cả khóa học</h2>
          <span className="rounded-full border bg-card px-2.5 py-0.5 text-xs font-semibold">{counts.all} Học phần</span>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="font-semibold text-muted-foreground">Lọc Gaze:</span>
            <div className="flex rounded-full border bg-card p-1">
              {(['all','active','completed'] as TabKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn('rounded-full px-3 py-1 text-xs font-semibold', tab===k ? 'bg-[#0f2d5e] text-white' : 'text-muted-foreground')}
                >
                  {k==='all' ? 'Tất cả' : k==='active' ? 'Đang học' : 'Hoàn thành'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Không tìm thấy khóa học phù hợp.</div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {filtered.map((e) => {
              const p = e.progress;
              const statusLabel = e.status === 'completed' ? `Hoàn thành ${p}%` : e.status==='active' ? `Đang học (${p}%)` : `Mới bắt đầu (${p}%)`;
              return (
                <Link
                  key={e.enrollmentId}
                  href={getCourseHref(e)}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:shadow-md"
                >
                  <div className="bg-gradient-to-br from-[#0f2d5e] via-[#1a4a8a] to-[#0ea5c8] p-4 text-white">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-white/15 px-2 py-0.5 text-xs font-bold tracking-wide">{e.course.id.slice(0,6).toUpperCase()}</span>
                      <span className="inline-flex items-center gap-1 rounded bg-[#7ee3f7] px-2 py-0.5 text-xs font-bold text-[#0f2d5e]">
                        <RiEyeLine className="h-3 w-3" /> Điểm Gaze: — <span className="font-normal">(pass)</span>
                      </span>
                    </div>
                    <p className="mt-3 flex items-center gap-1.5 text-xs opacity-90">
                      <span className={cn('h-2 w-2 rounded-full', e.status==='completed' ? 'bg-emerald-300' : e.status==='active' ? 'bg-cyan-300' : 'bg-white/60')} /> {statusLabel}
                    </p>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[#0f2d5e] group-hover:text-primary">{e.course.title}</h3>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {LEVEL_LABEL[e.course.level]} · {e.course.moduleCount} chương · {e.course.lessonCount} bài học
                    </p>
                    <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <RiBookOpenLine className="h-3.5 w-3.5" /> {e.course.teacherName}
                    </p>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Tiến độ học</span><span className="font-bold">{p}%</span></div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand-cyan" style={{ width: `${p}%` }} /></div>
                    </div>
                    <span className="mt-4 inline-flex h-8 items-center justify-center rounded-lg bg-[#0f2d5e] px-3 text-sm font-semibold text-white group-hover:bg-[#143a78]">
                      {e.status==='completed' ? 'Xem lại' : e.status==='active' && p>0 ? 'Tiếp tục học' : 'Bắt đầu học'} <RiArrowRightLine className="ml-1 h-4 w-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Ghi chú: các chỉ số <span className="font-mono">Fixation / Attention / Gaze Score / Heatmap</span> hiển thị <b>— (pass)</b> khi chưa có API gaze aggregates. Cần nối <span className="font-mono">GET /api/me/stats</span> và <span className="font-mono">/teacher/lessons/&#123;id&#125;/heatmap</span> để thay thế.
      </p>
    </main>
  );
}
