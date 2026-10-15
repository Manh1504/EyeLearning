import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f5f6f2] px-5 py-10">
      <section className="relative w-full max-w-3xl overflow-hidden rounded-[20px] border border-[#eeeee9] bg-white p-6 shadow-lg shadow-black/5 sm:p-10">
        <div aria-hidden className="absolute -right-20 -top-24 size-72 rounded-full bg-[#e8f1e6] blur-3xl" />
        <div className="absolute right-5 top-5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-warning" /> ROUTE UNAVAILABLE
        </div>
        <p className="relative font-mono text-[clamp(5rem,18vw,10rem)] font-semibold leading-none tracking-[-0.09em] text-foreground">404</p>
        <div className="mt-8 grid gap-7 border-t border-border/70 pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Không gian ngoài phạm vi</p>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-foreground">Không tìm thấy trang</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Đường dẫn bạn truy cập không tồn tại hoặc đã được di chuyển.</p>
          </div>
          <Button asChild>
            <Link href="/account/login">Về trang đăng nhập <Icon name="ri-arrow-right-line" /></Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
