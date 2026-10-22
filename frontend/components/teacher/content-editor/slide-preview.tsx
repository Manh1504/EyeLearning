"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { resolveMediaUrl } from "@/lib/api/client";
import type { SlideAdmin } from "@/lib/types/domain";

/**
 * Lưới xem trước slide. `slides` do trình soạn bài giảng truyền xuống (một
 * nguồn dữ liệu duy nhất cho cả xem trước và phần "Cài đặt nâng cao").
 */
export function SlidePreview({ slides }: { slides: SlideAdmin[] }) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    if (preview === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
      if (event.key === "ArrowLeft")
        setPreview((v) => (v === null ? v : (v - 1 + slides.length) % slides.length));
      if (event.key === "ArrowRight")
        setPreview((v) => (v === null ? v : (v + 1) % slides.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, slides.length]);

  if (slides.length === 0) return null;
  const previewSlide = preview === null ? null : slides[preview];

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {slides.map((slide, index) => {
          const url = resolveMediaUrl(slide.imageUrl);
          if (!url || failed[slide.id]) {
            return (
              <div
                key={slide.id}
                className="flex aspect-[4/3] items-center justify-center rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa] text-xs font-medium tabular-nums text-black/40"
              >
                {slide.orderIndex}
              </div>
            );
          }
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => setPreview(index)}
              aria-label={`Xem trước trang ${slide.orderIndex}`}
              className="group overflow-hidden rounded-[18px] border border-[#eeeee9] bg-white p-1 outline-none transition hover:border-black/15 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-black/20"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Trang ${slide.orderIndex}`}
                loading="lazy"
                onError={() => setFailed((c) => ({ ...c, [slide.id]: true }))}
                className="aspect-[4/3] w-full object-contain transition group-hover:scale-[1.02]"
              />
            </button>
          );
        })}
      </div>

      {previewSlide && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Đóng xem trước"
            className="absolute inset-0 cursor-default bg-black/75"
            onClick={() => setPreview(null)}
          />
          <div className="relative flex max-h-full w-full max-w-4xl flex-col rounded-[20px] border border-[#eeeee9] bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold tabular-nums text-foreground">
                Trang {previewSlide.orderIndex} / {slides.length}
              </p>
              <Button variant="ghost" size="icon-sm" onClick={() => setPreview(null)} aria-label="Đóng">
                <Icon name="ri-close-line" className="size-5" />
              </Button>
            </div>
            {(() => {
              const url = resolveMediaUrl(previewSlide.imageUrl);
              return url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={previewSlide.id}
                  src={url}
                  alt={`Trang ${previewSlide.orderIndex}`}
                  className="mt-3 max-h-[70dvh] w-full rounded-lg bg-white object-contain"
                />
              ) : (
                <p className="mt-3 rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa] px-3 py-8 text-center text-sm text-muted-foreground">
                  Không tải được ảnh trang {previewSlide.orderIndex}.
                </p>
              );
            })()}
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPreview((v) => (v === null ? v : (v - 1 + slides.length) % slides.length))
                }
                disabled={slides.length <= 1}
              >
                <Icon name="ri-arrow-left-line" className="size-4" />
                Trang trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreview((v) => (v === null ? v : (v + 1) % slides.length))}
                disabled={slides.length <= 1}
              >
                Trang sau
                <Icon name="ri-arrow-right-line" className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
