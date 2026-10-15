import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-sans" });
const geist = Geist({ subsets: ["latin"], variable: "--font-heading" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "GazeEdu – Webcam Eye Tracking for Learning Analytics",
  description:
    "Nền tảng học tập sử dụng webcam eye-tracking để phân tích hành vi quan sát trên từng trang tài liệu.",
  icons: {
    icon: [
      { url: "/brand/gazeedu-icon.svg", type: "image/svg+xml" },
      { url: "/brand/gazeedu-favicon.png", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      className={cn(inter.variable, geist.variable, geistMono.variable, "h-full")}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
