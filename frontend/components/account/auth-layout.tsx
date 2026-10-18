import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Icon } from "@/components/ui/icon";

const HIGHLIGHTS = [
  { icon: "ri-focus-2-line", text: "Theo dõi hành vi mắt theo từng trang slide" },
  { icon: "ri-bar-chart-box-line", text: "Heatmap và mức độ tập trung cho giảng viên" },
  { icon: "ri-rocket-2-line", text: "Calibration nhanh, học ngay trên trình duyệt" },
];

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-[#f5f6f2] p-3 font-sans text-[#111111] [--accent:#e8f1e6] [--accent-foreground:#36533a] [--background:#fdfdfa] [--border:#eeeee9] [--destructive:#c0362c] [--font-heading:var(--font-sans)] [--foreground:#222320] [--input:#e8e8e3] [--muted:#f5f6f2] [--muted-foreground:#74766f] [--primary:#111111] [--primary-active:#000000] [--primary-foreground:#ffffff] [--primary-hover:#292929] [--ring:#111111] [--surface:#ffffff] sm:p-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:gap-5">
      <aside className="relative hidden flex-col justify-between overflow-hidden rounded-[20px] border border-[#e7e9e2] bg-[#fdfdfa] px-10 py-10 shadow-xs lg:flex xl:px-14 xl:py-12">
        <div aria-hidden className="absolute -right-20 -top-20 size-72 rounded-full bg-[#e8f1e6] blur-3xl" />

        <Link
          href="/"
          aria-label="Về trang chủ GazeEdu"
          className="relative w-fit rounded-md outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-4 focus-visible:ring-offset-[#fdfdfa]"
        >
          <BrandLogo priority className="h-8 w-auto grayscale" />
        </Link>

        <div className="relative max-w-xl">
          <div className="mb-7 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#666666]">
            <span className="size-1.5 rounded-full bg-primary" />
            Học tập dựa trên dữ liệu
          </div>
          <h1 className="max-w-lg text-[2.65rem] font-semibold leading-[1.08] tracking-[-0.04em] text-black xl:text-5xl">
            Hiểu cách người học tập trung.
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-[#606060]">
            GazeEdu kết hợp webcam và eye-tracking để mang lại trải nghiệm học tập cá nhân
            hóa cùng phân tích trực quan cho giảng viên.
          </p>
          <ul className="mt-9 grid gap-2.5">
            {HIGHLIGHTS.map((item, index) => (
              <li
                key={item.text}
                className="group flex items-center gap-4 rounded-[18px] border border-[#eeeee9] bg-white px-4 py-3.5 text-sm font-medium text-[#252525] shadow-xs transition hover:border-[#dfe9dc] hover:shadow-sm"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#dfe9dc] bg-[#e8f1e6]">
                  <Icon name={item.icon} className="size-4 text-black" />
                </span>
                <span className="flex-1">{item.text}</span>
                <span className="text-[10px] font-semibold tabular-nums text-[#9a9a9a]">
                  0{index + 1}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between border-t border-[#dddddd] pt-5 text-[11px] text-[#777777]">
          <p>© {new Date().getFullYear()} GazeEdu</p>
          <p className="flex items-center gap-2">
            <Icon name="ri-shield-check-line" className="size-3.5 text-black" />
            Dữ liệu gaze được xử lý bảo mật
          </p>
        </div>
      </aside>

      <main className="flex min-h-[calc(100vh-1.5rem)] items-center justify-center rounded-[20px] border border-[#eeeee9] bg-white px-5 py-8 shadow-xs sm:min-h-[calc(100vh-2.5rem)] sm:px-8 sm:py-12 lg:min-h-0 lg:px-10 xl:px-16">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex items-center justify-between border-b border-[#e8e8e8] pb-5 lg:hidden">
            <Link
              href="/"
              aria-label="Về trang chủ GazeEdu"
              className="rounded-md outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-4"
            >
              <BrandLogo priority className="h-7 w-auto grayscale" />
            </Link>
            <span className="rounded-full border border-[#dfe9dc] bg-[#e8f1e6] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#536650]">
              Đăng nhập
            </span>
          </div>
          <div className="[&>div:first-child>h1]:!font-sans">{children}</div>
        </div>
      </main>
    </div>
  );
}
