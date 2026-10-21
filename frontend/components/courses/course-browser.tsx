"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ENROLL_LABEL } from "@/lib/constants";
import type { EnrollStatus } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

export interface CourseListItem {
  id: string;
  title: string;
  teacherName: string;
  moduleCount: number;
  lessonCount: number;
  enrolledAt: string;
  status: EnrollStatus;
  href: string;
}

type SortColumn = "title" | "teacher" | "lessons" | "enrolled";
type SortDir = "asc" | "desc";
type SortState = { column: SortColumn; dir: SortDir };

// Cột lưới dùng chung cho hàng tiêu đề và từng hàng khóa học (từ lg trở lên).
const LIST_GRID = "lg:grid-cols-[minmax(0,1fr)_200px_160px_150px_28px]";

const STATUS_CLS: Record<string, string> = {
  active: "bg-[#e8f1e6] text-[#52704f]",
  completed: "bg-muted text-muted-foreground",
  dropped: "bg-[#f3ede4] text-[#8a6d3b]",
};

// Định dạng dd/MM/yyyy tất định từ ISO → tránh lệch locale/timezone khi SSR.
function formatDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function SortButton({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: SortColumn;
  sort: SortState;
  onSort: (column: SortColumn) => void;
  className?: string;
}) {
  const active = sort.column === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={
        active
          ? `Đang sắp xếp theo ${label} ${sort.dir === "asc" ? "tăng dần" : "giảm dần"}. Bấm để đổi chiều.`
          : `Sắp xếp theo ${label}`
      }
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {label}
      <Icon
        name={active && sort.dir === "desc" ? "ri-arrow-down-s-line" : "ri-arrow-up-s-line"}
        className={cn("size-3.5", !active && "opacity-0")}
      />
    </button>
  );
}

function CourseRow({ item }: { item: CourseListItem }) {
  return (
    <Link
      prefetch={false}
      href={item.href}
      className={cn(
        "grid grid-cols-1 gap-3 px-4 py-4 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 lg:items-center lg:gap-4 lg:px-5",
        LIST_GRID,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef3eb] text-[#52654f]">
          <Icon name="ri-book-open-line" className="size-5" />
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold leading-6 text-foreground">
            {item.title}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              STATUS_CLS[item.status] ?? STATUS_CLS.active,
            )}
          >
            {ENROLL_LABEL[item.status] ?? item.status}
          </span>
        </div>
      </div>

      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Icon name="ri-user-line" className="size-3.5 shrink-0 lg:hidden" />
        <span className="truncate">{item.teacherName}</span>
      </span>

      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Icon name="ri-slideshow-3-line" className="size-3.5 shrink-0 lg:hidden" />
        <span className="truncate">
          {item.moduleCount} chương · {item.lessonCount} bài
        </span>
      </span>

      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground lg:justify-self-end lg:text-right">
        <Icon name="ri-calendar-line" className="size-3.5 shrink-0 lg:hidden" />
        <span className="truncate">{formatDate(item.enrolledAt)}</span>
      </span>

      <Icon
        name="ri-arrow-right-line"
        className="hidden size-4 shrink-0 text-muted-foreground lg:block lg:justify-self-end"
      />
    </Link>
  );
}

export function CourseBrowser({
  items,
  isLoading,
  isError,
  onRetry,
  emptyTitle,
  emptyDescription,
}: {
  items: CourseListItem[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(urlQuery);
  const [sort, setSort] = useState<SortState>({ column: "enrolled", dir: "desc" });

  // Ghi từ khóa vào URL (?q=) sau khi người dùng ngừng gõ → giữ khi tải lại/chia sẻ.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = searchParams.toString();
      const params = new URLSearchParams(current);
      if (query) params.set("q", query);
      else params.delete("q");
      const next = params.toString();
      if (next !== current) {
        router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, searchParams, pathname, router]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    const filtered = keyword
      ? items.filter((item) =>
          `${item.title} ${item.teacherName}`.toLocaleLowerCase("vi").includes(keyword),
        )
      : items;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.column === "title") return factor * a.title.localeCompare(b.title, "vi");
      if (sort.column === "teacher") return factor * a.teacherName.localeCompare(b.teacherName, "vi");
      if (sort.column === "lessons") return factor * (a.lessonCount - b.lessonCount);
      return factor * a.enrolledAt.localeCompare(b.enrolledAt);
    });
  }, [items, query, sort]);

  const toggleSort = (column: SortColumn) =>
    setSort((prev) =>
      prev.column === column
        ? { column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column, dir: "asc" },
    );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[84px] rounded-[20px]" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Không tải được danh sách khóa học"
        description="Vui lòng kiểm tra kết nối và thử lại."
        onRetry={onRetry}
      />
    );
  }

  if (items.length === 0) {
    return <EmptyState icon="ri-book-open-line" title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <section className="space-y-5">
      <div className="relative sm:w-72">
        <Icon
          name="ri-search-line"
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm khóa học theo tên"
          aria-label="Tìm khóa học theo tên"
          className="h-9 bg-muted/55 pl-9"
        />
      </div>

      {visible.length ? (
        <div className="divide-y divide-border/70 overflow-hidden rounded-[20px] border border-border/80 bg-white shadow-xs">
          <div
            className={cn(
              "hidden items-center gap-4 bg-muted/40 px-4 py-2.5 lg:grid lg:px-5",
              LIST_GRID,
            )}
          >
            <SortButton label="Khóa học" column="title" sort={sort} onSort={toggleSort} className="justify-self-start" />
            <SortButton label="Giảng viên" column="teacher" sort={sort} onSort={toggleSort} className="justify-self-start" />
            <SortButton label="Nội dung" column="lessons" sort={sort} onSort={toggleSort} className="justify-self-start" />
            <SortButton label="Ghi danh" column="enrolled" sort={sort} onSort={toggleSort} className="justify-self-end" />
            <span aria-hidden />
          </div>
          {visible.map((item) => (
            <CourseRow key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="ri-search-line"
          title="Không tìm thấy khóa học"
          description="Thử thay đổi từ khóa tìm kiếm."
        />
      )}
    </section>
  );
}
