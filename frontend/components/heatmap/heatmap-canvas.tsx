'use client';

// components/heatmap/heatmap-canvas.tsx — Bản vẽ heatmap KDE dùng chung.
// Nguồn gốc: luồng dùng thử (/try) — density SCALE=6 + colorize gain 255/maxAlpha.
// Mặc định đã hạ: độ đậm 0.6, point nhỏ (factor 0.07), alpha nền thấp.

import { useEffect, useRef, useState } from 'react';

import { heatColor } from '@/lib/heatmap-colors';

export const HEATMAP_DEFAULT_OPACITY = 0.6;
export const HEATMAP_POINT_RADIUS_FACTOR = 0.07;
const HEATMAP_BASE_ALPHA = 50;
const HEATMAP_ALPHA_RANGE = 150;
const HEATMAP_MIN_ALPHA = 0.02;

/** Vẽ density KDE + colorize lên canvas đã có kích thước CSS width/height. */
export function drawKdeHeatmap(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  points: Array<[number, number]>,
  pointRadiusFactor: number = HEATMAP_POINT_RADIUS_FACTOR,
): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || width <= 0 || height <= 0) return false;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (points.length === 0) return false;

  const SCALE = 6;
  const dw = Math.max(12, Math.round(width / SCALE));
  const dh = Math.max(12, Math.round(height / SCALE));
  const density = document.createElement('canvas');
  density.width = dw;
  density.height = dh;
  const dctx = density.getContext('2d');
  if (!dctx) return false;
  dctx.globalCompositeOperation = 'lighter';

  const pointR = Math.max(4, dw * pointRadiusFactor);
  for (const [x, y] of points) {
    const cx = x * dw;
    const cy = y * dh;
    const gradient = dctx.createRadialGradient(cx, cy, 0, cx, cy, pointR);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    dctx.fillStyle = gradient;
    dctx.beginPath();
    dctx.arc(cx, cy, pointR, 0, Math.PI * 2);
    dctx.fill();
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(density, 0, 0, dw, dh, 0, 0, width, height);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;

  let maxAlpha = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > maxAlpha) maxAlpha = data[i];
  }
  if (maxAlpha < 1) return false;
  const gain = 255 / maxAlpha;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    if (a < HEATMAP_MIN_ALPHA) {
      data[i + 3] = 0;
      continue;
    }
    const t = Math.min(1, Math.pow(a * gain, 0.6));
    const [r, g, b] = heatColor(t);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = Math.round(HEATMAP_BASE_ALPHA + t * HEATMAP_ALPHA_RANGE);
  }

  ctx.putImageData(img, 0, 0);
  return true;
}

export function HeatmapCanvas({
  src,
  title,
  points,
  opacity = HEATMAP_DEFAULT_OPACITY,
  pointRadiusFactor = HEATMAP_POINT_RADIUS_FACTOR,
}: {
  src: string;
  title: string;
  points: Array<[number, number]>;
  opacity?: number;
  pointRadiusFactor?: number;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    drawKdeHeatmap(canvas, stage.clientWidth, stage.clientHeight, points, pointRadiusFactor);
  }, [points, pointRadiusFactor, stageSize]);

  return (
    <div
      ref={stageRef}
      className="relative w-full overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      style={{ aspectRatio: '16 / 9' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={title} className="absolute inset-0 h-full w-full bg-white object-contain" />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity }}
      />
      <span className="absolute bottom-2 left-2 rounded-md bg-brand-dark/70 px-2 py-1 text-[11px] font-medium text-white">
        {title}
      </span>
    </div>
  );
}
