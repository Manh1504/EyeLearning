"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f5f6f2] px-5 py-10">
      <section className="w-full max-w-2xl overflow-hidden rounded-[20px] border border-[#eeeee9] bg-white shadow-lg shadow-black/5">
        <div className="grid min-h-80 sm:grid-cols-[0.7fr_1.3fr]">
          <div className="flex flex-col justify-between border-b border-[#dfe9dc] bg-[#e8f1e6] p-6 text-foreground sm:border-b-0 sm:border-r">
            <span className="font-mono text-xs text-muted-foreground">SYS / ERR</span>
            <span className="flex size-14 items-center justify-center rounded-full bg-white shadow-xs">
              <Icon name="ri-error-warning-line" className="size-7 text-foreground" />
            </span>
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-9">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-destructive">Gián đoạn hệ thống</p>
            <h1 className="mt-3 text-2xl font-bold tracking-[-0.035em] text-foreground">Đã có lỗi xảy ra</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              {error.message || "Ứng dụng gặp sự cố không mong muốn. Vui lòng thử lại."}
            </p>
            {error.digest && <p className="mt-4 font-mono text-[10px] text-muted-foreground">REF {error.digest}</p>}
            <Button onClick={reset} className="mt-7 self-start">
              <Icon name="ri-refresh-line" />
              Thử lại
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
