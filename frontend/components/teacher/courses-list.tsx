'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { RiSearchLine, RiBookOpenLine, RiGroupLine, RiCheckLine, RiEyeLine } from '@remixicon/react';

import { buttonVariants } from '@/components/ui/button';
import { useTeacherCourses } from '@/hooks/use-teacher';
import { LEVEL_LABEL, STATUS_LABEL } from '@/lib/mock/teacher';
import type { TeacherCourse } from '@/lib/types/domain';
import { cn } from '@/lib/utils';

function courseHref(c: TeacherCourse) {
  return `/teacher/courses/${c.id}?tab=content`;
}

export default function TeacherCoursesPage() {
  const [query, setQuery] = useState('');
  const { data: courses = [], isLoading, isError } = useTeacherCourses();

  const filtered = useMemo(() => {
    const kw = query.trim().toLocaleLowerCase('vi');
    return courses.filter((c) => !kw || c.title.toLocaleLowerCase('vi').includes(kw) || c.description.toLocaleLowerCase('vi').includes(kw));
  }, [courses, query]);

  const totalStudents = courses.reduce((s, c) => s + c.students, 0);
  // Stats derived — gaze metrics chưa có -> pass
  const avgCompletion = courses.length ? Math.round(courses.reduce((s, c) => s + c.completion, 0) / courses.length) : 0;

  if (isLoading) {
    return <main className="mx-auto max-w-[1280px] px-4 py-6"><div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Đang tải khóa học...</div></main>;
  }
  if (isError) {
    return <main className="mx-auto max-w-[1280px] px-4 py-6"><div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-sm text-destructive">Không tải được danh sách.</div></main>;
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6">
      {/* Header — khớp ảnh Main Wrapper */}
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-[#0f2d5e] text-white">◉</div>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold text-[#0f2d5e]">Không gian Giảng viên <span className="bg-[#e8f0ff] px-2 py-0.5 text-xs font-bold tracking-wide text-[#0f2d5e]">HỌC KỲ II - 2024</span></h1>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><span className="font-semibold text-foreground">TS. Nguyễn Trí Dũng</span> <span className="text-xs text-[#0b5f7a]">Lab Director #402</span></p>
            </div>
          </div>
          <div className="hidden rounded bg-muted p-1 text-xs text-muted-foreground sm:flex">
            <span>Không gian Giảng viên · Hệ thống giám sát khoa học nhận thức</span>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-[11px] font-bold tracking-wide text-[#0b5f7a]">HỆ THỐNG GIÁM SÁT KHOA HỌC NHẬN THỨC</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-[#0f2d5e]">Quản lý Khóa học & Dữ liệu Gaze Tracking</h2>
            <div className="ml-auto flex gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-[#eef6ff] px-3 py-2 text-xs font-semibold text-[#0f2d5e]">Đồng bộ ML / Gaze <span className="text-[11px] text-muted-foreground">(pass — chưa nối)</span></span>
              <Link href="/teacher/courses/c-new?tab=content&new=1" className={cn(buttonVariants(), 'bg-[#01bcea] hover:bg-[#00a6d1] text-white')}>+ Tạo khóa học mới</Link>
            </div>
          </div>
        </div>

        {/* Stats 4 boxes */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-wide text-muted-foreground">KHÓA HỌC ĐANG GIẢNG <RiBookOpenLine className="ml-auto h-4 w-4 text-[#0b5f7a]" /></p>
            <p className="mt-2 text-3xl font-bold text-[#0f2d5e]">{String(courses.length).padStart(2,'0')} <span className="text-sm font-normal text-muted-foreground">học phần</span></p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-wide text-muted-foreground">SINH VIÊN GHI DANH <RiGroupLine className="ml-auto h-4 w-4 text-[#0b5f7a]" /></p>
            <p className="mt-2 text-3xl font-bold text-[#0f2d5e]">{totalStudents} <span className="text-sm font-normal text-muted-foreground">sinh viên</span></p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-wide text-muted-foreground">TỶ LỆ XEM & HOÀN THÀNH <RiCheckLine className="ml-auto h-4 w-4 text-[#0b5f7a]" /></p>
            <p className="mt-2 text-3xl font-bold text-[#0f2d5e]">{avgCompletion || '—'}% <span className="text-xs font-normal text-muted-foreground">({totalStudents ? `—/${totalStudents}` : 'pass'})</span></p>
            <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full bg-brand-cyan" style={{ width: `${avgCompletion}%` }} /></div>
            <p className="mt-1 text-[11px] text-muted-foreground">Cần BE: completion aggregates (pass)</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-wide text-[#0b5f7a]">GAZE ATTENTION INDEX <RiEyeLine className="ml-auto h-4 w-4 text-brand-cyan" /></p>
            <p className="mt-2 text-3xl font-bold text-[#0b5f7a]">— <span className="text-sm font-normal text-muted-foreground">/100</span></p>
            <p className="mt-1 rounded bg-[#e8f9fd] px-2 py-1 text-xs font-semibold text-[#0b5f7a]">Fixation Dwell & Saccade — Tối ưu <span className="font-normal">(pass)</span></p>
            <p className="mt-1 text-[11px] text-muted-foreground note">Đang phát triển: GET /teacher/lessons/&#123;id&#125;/heatmap</p>
          </div>
        </div>

        <label className="relative mt-4 flex h-10 items-center rounded bg-muted px-3">
          <RiSearchLine className="h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm kiếm theo mã khóa học, tên học phần hoặc chủ đề slide..." className="ml-2 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <span className="rounded bg-white px-2 py-0.5 text-xs text-muted-foreground">ESC</span>
        </label>
      </header>

      <section className="pt-6">
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-lg font-bold text-[#0f2d5e]"><span className="h-3 w-3 bg-brand-cyan" /> Danh Sách Khóa Học & Dữ Liệu Thị Giác Chi Tiết</h3>
          <span className="ml-auto text-xs text-muted-foreground">Hiển thị {filtered.length} / {courses.length} khóa đang vận hành</span>
        </div>

        <div className="mt-4 space-y-4">
          {filtered.map((course, idx) => {
            const isFeatured = idx === 0;
            return (
              <article key={course.id} className={cn('rounded-xl border bg-card p-5 shadow-sm', isFeatured && 'ring-1 ring-[#0f2d5e]/10')}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {isFeatured && <span className="bg-brand-cyan px-2 py-0.5 font-bold text-white">KHÓA TRỌNG ĐIỂM</span>}
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold', course.status==='published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                        <span className={cn('h-2 w-2 rounded-full', course.status==='published' ? 'bg-emerald-500' : 'bg-amber-500')} /> {STATUS_LABEL[course.status]}
                      </span>
                      <span className="text-muted-foreground">· {LEVEL_LABEL[course.level]} · — Modules · — Slides <span className="text-[11px]">(pass — cần course tree)</span></span>
                    </div>
                    <h4 className="mt-2 text-lg font-bold leading-snug text-[#0f2d5e]">{course.title}</h4>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{course.description || '— mô tả khóa học (pass)'}</p>
                  </div>
                  <div className="rounded bg-[#f3f7fa] p-3 text-right">
                    <p className="text-[11px] font-bold tracking-wide text-muted-foreground">GAZE SCORE</p>
                    <p className="text-2xl font-bold text-[#0b5f7a]">{course.attention ?? '—'}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
                    <p className="text-xs font-semibold text-[#0b5f7a]">{course.attention ? 'Rất Tập Trung' : '— (pass)'}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded bg-[#f3f7fa] p-3 text-sm lg:grid-cols-4">
                  <div><p className="text-[11px] tracking-wide text-muted-foreground">TỔNG SINH VIÊN</p><p className="text-lg font-bold">{course.students}</p></div>
                  <div><p className="text-[11px] tracking-wide text-muted-foreground">ĐÃ XEM SLIDE TUẦN NÀY</p><p className="text-lg font-bold">— / {course.students} <span className="text-xs font-normal text-muted-foreground">(pass)</span></p><div className="mt-1 h-1 rounded-full bg-white"><div className="h-full bg-brand-cyan" style={{ width: `${course.completion}%` }} /></div></div>
                  <div><p className="text-[11px] tracking-wide text-muted-foreground">DWELL TIME TB / SLIDE</p><p className="text-lg font-bold">— <span className="text-xs font-normal text-muted-foreground">(pass — cần gaze_events)</span></p></div>
                  <div><p className="text-[11px] tracking-wide text-muted-foreground">HÀNH VI THỊ GIÁC AI</p><p className="text-xs font-semibold">— <span className="font-normal text-muted-foreground">(pass — cần AOI analysis)</span></p></div>
                </div>

                <div className="mt-3 hidden h-2 grid-cols-6 gap-1 lg:grid">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={cn('rounded-sm h-2', i < 3 ? 'bg-brand-cyan' : 'bg-muted')} />
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`${courseHref(course)}&tab=overview`} className="inline-flex h-9 items-center gap-1 rounded bg-[#01bcea] px-4 text-sm font-semibold text-white hover:bg-[#00a6d1]">Xem bản đồ nhiệt Heatmap</Link>
                  <Link href={courseHref(course)} className="inline-flex h-9 items-center gap-1 rounded bg-muted px-3 text-sm font-medium hover:bg-accent">Quản lý nội dung & Slide</Link>
                  <Link href={`${courseHref(course)}&tab=students`} className="inline-flex h-9 items-center gap-1 rounded bg-muted px-3 text-sm font-medium hover:bg-accent">Danh sách sinh viên ({course.students})</Link>
                  <Link href={`${courseHref(course)}&tab=overview`} className="ml-auto inline-flex h-9 items-center gap-1 rounded px-3 text-sm text-muted-foreground hover:text-foreground">Thiết lập</Link>
                </div>
              </article>
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Không tìm thấy khóa học phù hợp.</div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">Các số liệu hiển thị <b>— (pass)</b> là placeholder cho dữ liệu gaze chưa có. Cần nối <span className="font-mono">GET /teacher/courses/:id/students</span> và heatmap aggregates.</p>
      </section>
    </main>
  );
}
