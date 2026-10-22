"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Một "người canh" thay đổi chưa lưu. Form nào có trạng thái nháp (quiz, thông
 * tin khóa học…) đăng ký một người canh; khi giáo viên chuyển mục / chuyển tab /
 * rời trang mà còn dư liệu chưa lưu thì hộp thoại xác nhận hiện ra.
 */
export interface LeaveGuard {
  /** Nhãn ngắn hiển thị trong hộp thoại, ví dụ "bài tập" hoặc "thông tin khóa học". */
  label: string;
  /** Có thay đổi chưa lưu hay không. */
  isDirty: () => boolean;
  /** Lưu lại và trả về true nếu thành công. Không có = chỉ có thể bỏ thay đổi. */
  save?: () => Promise<boolean>;
}

interface UnsavedGuardValue {
  /** Đăng ký người canh; trả về hàm huỷ đăng ký (dùng làm cleanup của useEffect). */
  register: (guard: LeaveGuard) => () => void;
  /** Chạy `proceed` nếu không có thay đổi; ngược lại mở hộp thoại xác nhận trước. */
  confirmLeave: (proceed: () => void) => void;
}

const UnsavedGuardContext = createContext<UnsavedGuardValue | null>(null);

/** Lấy bộ điều phối cảnh báo chưa lưu. null khi nằm ngoài provider. */
export function useUnsavedGuard() {
  return useContext(UnsavedGuardContext);
}

export function UnsavedGuardProvider({ children }: { children: React.ReactNode }) {
  const guardsRef = useRef<Set<LeaveGuard>>(new Set());
  const [pending, setPending] = useState<{ proceed: () => void; guard: LeaveGuard } | null>(null);
  const [saving, setSaving] = useState(false);

  const register = useCallback((guard: LeaveGuard) => {
    guardsRef.current.add(guard);
    return () => {
      guardsRef.current.delete(guard);
    };
  }, []);

  const firstDirtyGuard = useCallback(() => {
    for (const guard of guardsRef.current) {
      if (guard.isDirty()) return guard;
    }
    return null;
  }, []);

  const confirmLeave = useCallback(
    (proceed: () => void) => {
      const guard = firstDirtyGuard();
      if (!guard) {
        proceed();
        return;
      }
      setPending({ proceed, guard });
    },
    [firstDirtyGuard],
  );

  // Rời trang thật (reload / đóng tab / đổi URL) — trình duyệt chỉ cho hiện hộp
  // thoại mặc định nên ta chỉ cần bật cờ chặn.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!firstDirtyGuard()) return;
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [firstDirtyGuard]);

  const discardAndLeave = () => {
    const proceed = pending?.proceed;
    setPending(null);
    if (proceed) window.setTimeout(proceed, 0);
  };

  const saveAndLeave = async () => {
    if (!pending) return;
    setSaving(true);
    const ok = pending.guard.save ? await pending.guard.save() : false;
    setSaving(false);
    // Lưu lỗi → đóng hộp thoại để giáo viên thấy thông báo lỗi ngay trong trình soạn.
    setPending(null);
    if (ok) window.setTimeout(pending.proceed, 0);
  };

  return (
    <UnsavedGuardContext.Provider value={{ register, confirmLeave }}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setPending(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="ri-error-warning-line" className="size-5 text-warning" />
              Còn thay đổi chưa lưu
            </DialogTitle>
            <DialogDescription>
              {pending
                ? `Bạn đang soạn ${pending.guard.label} và chưa lưu. Rời đi bây giờ sẽ mất phần đang nhập.`
                : "Bạn có thay đổi chưa lưu."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              disabled={saving}
              onClick={() => setPending(null)}
            >
              Ở lại soạn tiếp
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={saving}
                onClick={discardAndLeave}
              >
                Bỏ thay đổi
              </Button>
              {pending?.guard.save && (
                <Button
                  type="button"
                  className="rounded-full"
                  disabled={saving}
                  onClick={() => void saveAndLeave()}
                >
                  {saving ? "Đang lưu…" : "Lưu & tiếp tục"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UnsavedGuardContext.Provider>
  );
}
