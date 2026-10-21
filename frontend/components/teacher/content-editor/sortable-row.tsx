"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type SortableHandle = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">;

/**
 * Tay kéo nằm trong `SortableRow` nhận `attributes`/`listeners` qua context, nhờ
 * vậy JSX của dòng item không phải bọc render-prop.
 */
const DragHandleContext = createContext<SortableHandle | null>(null);

/**
 * Bọc một dòng item (bài học/bài tập) trong chương thành phần tử kéo thả được.
 * `children` là toàn bộ nội dung dòng (tiêu đề + bảng chỉnh sửa bên dưới).
 */
export function SortableRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  return (
    <DragHandleContext.Provider value={{ attributes, listeners }}>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn(isDragging && "relative z-10 opacity-40")}
      >
        {children}
      </div>
    </DragHandleContext.Provider>
  );
}

/** Tay kéo của dòng hiện tại; không render gì nếu nằm ngoài `SortableRow`. */
export function DragHandle({ label }: { label: string }) {
  const handle = useContext(DragHandleContext);
  if (!handle) return null;
  return (
    <button
      type="button"
      {...handle.attributes}
      {...handle.listeners}
      aria-label={label}
      title="Kéo để sắp xếp"
      className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-muted-foreground hover:bg-[#e8f1e6] active:cursor-grabbing"
    >
      <Icon name="ri-draggable" className="size-4" />
    </button>
  );
}
