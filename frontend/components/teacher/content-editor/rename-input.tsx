"use client";

import { useState } from "react";
import { INPUT_CLS } from "@/components/teacher/workspace-ui";
import { cn } from "@/lib/utils";

export function RenameInput({
  value,
  canEdit,
  onCommit,
  className,
}: {
  value: string;
  canEdit: boolean;
  onCommit: (value: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!canEdit) {
    return <span className={cn("min-w-0 flex-1 truncate text-foreground", className)}>{value}</span>;
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim() && draft.trim() !== value) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={cn(INPUT_CLS, "h-9 min-w-0 flex-1", className)}
        aria-label="Đổi tên"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={cn(
        "min-w-0 flex-1 truncate rounded-md px-1 text-left text-foreground transition-colors hover:bg-[#e8f1e6]/55",
        className,
      )}
      title="Bấm để đổi tên"
    >
      {value}
    </button>
  );
}
