// hooks/use-gaze-tracker.ts — Bật camera + WebSocket /infer (AI server, image
// hieunm1501/gaze-api) để lấy điểm nhìn THẬT từ pipeline AI. Nếu chưa có params
// calibration hoặc camera / AI service không khả dụng → rơi về điểm mô phỏng
// để demo vẫn chạy.
//
// Luồng (khớp API/server.py đang chạy):
//   1. calibrated=true → tải 6 tham số hiệu chỉnh active từ backend
//      (GET /api/calibrations/active/params)
//   2. mở WS /infer → message TEXT đầu tiên {"params":[6],"smooth":true} → server ack
//   3. mỗi frame gửi binary JPEG → nhận {"ok","x","y"} chuẩn hóa hoặc
//      {"ok": false, "error": "no_face"} → onPoint(-1, -1) để ghi "không nhìn màn".
//
// onPoint(x, y): x/y hợp lệ trong [0,1] = điểm nhìn THẬT; khi "no_face" hook
// gửi onPoint(-1, -1) để phía dưới ghi nhận "không nhìn màn" (on_slide giảm
// đúng) nhưng không đưa vào hiển thị chấm.

'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchActiveParams } from '@/lib/api/calibration';

export type GazeSource = 'real' | 'simulated' | 'off';

export interface UseGazeTrackerOptions {
  enabled: boolean;
  calibrated: boolean;
  onPoint: (x: number, y: number, source: GazeSource) => void;
}

export interface GazeTrackerState {
  stream: MediaStream | null;
  source: GazeSource;
}

// Nối thẳng WebSocket tới AI server (API/server.py). Luôn kết nối tới đường
// /infer. Nếu env có ghi sẵn hậu tố /infer thì bỏ đi để khỏi trùng.
const WS_ORIGIN = (
  process.env.NEXT_PUBLIC_EYE_TRACKING_WS_URL?.trim() || 'ws://localhost:9000/infer'
).replace(/\/infer\/?$/, '');

const RESPONSE_TIMEOUT_MS = 5000; // quá 5s không có reply → thử lại frame sau
const MIN_GAP_MS = 80;            // nghỉ tối thiểu sau 1 reply ok
const NO_FACE_SLOW_MS = 1000;     // backoff khi liên tục không thấy mặt
const MAX_RECONNECTS = 5;         // tối đa lần thử mở lại WS trước khi về mô phỏng

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useGazeTracker({
  enabled,
  calibrated,
  onPoint,
}: UseGazeTrackerOptions): GazeTrackerState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [source, setSource] = useState<GazeSource>('off');

  const onPointRef = useRef(onPoint);

  useEffect(() => {
    onPointRef.current = onPoint;
  });

  useEffect(() => {
    let disposed = false;
    let simTimer = 0;
    let streamCleanup: (() => void) | null = null;

    const startSimulation = () => {
      simTimer = window.setInterval(() => {
        const x = 0.12 + Math.random() * 0.76;
        const y = 0.14 + Math.random() * 0.68;
        onPointRef.current(x, y, 'simulated');
      }, 1800);
      setSource('simulated');
    };

    const captureFrame = async (video: HTMLVideoElement): Promise<Blob | null> => {
      if (video.videoWidth === 0 || video.videoHeight === 0) return null;
      const scale = Math.min(1, 480 / video.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78));
    };

    // Giữ 1 phiên WS: gửi text config trước, rồi binary JPEG, hồi đáp tuần tự.
    // Trả 'retry' khi WS rớt (để ngoài thử lại), 'abort' khi component disposed.
    const runWsSession = async (
      video: HTMLVideoElement,
      params: number[],
    ): Promise<'retry' | 'abort'> => {
      const ws = new WebSocket(`${WS_ORIGIN}/infer`);
      let pendingResolve: ((event: MessageEvent | null) => void) | null = null;
      let sessionClosed = false;

      const sendAndAwait = (
        payload: string | Blob,
        timeoutMs: number,
      ): Promise<MessageEvent | null> =>
        new Promise<MessageEvent | null>((resolve) => {
          let done = false;
          const finish = (event: MessageEvent | null) => {
            if (done) return;
            done = true;
            resolve(event);
          };
          pendingResolve = finish;
          window.setTimeout(() => finish(null), timeoutMs);
          ws.send(payload);
        });

      try {
        const wsReady = new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('ws_timeout')), 8000);
          ws.onopen = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          ws.onerror = () => {
            window.clearTimeout(timeout);
            reject(new Error('ws_error'));
          };
        });
        ws.onclose = () => {
          sessionClosed = true;
          const currentResolve = pendingResolve;
          pendingResolve = null;
          currentResolve?.(null);
        };
        ws.onmessage = (event: MessageEvent) => {
          const currentResolve = pendingResolve;
          pendingResolve = null;
          currentResolve?.(event);
        };

        await wsReady;
        if (disposed) return 'abort';

        const configReply = await sendAndAwait(
          JSON.stringify({ params, smooth: true }),
          RESPONSE_TIMEOUT_MS,
        );
        pendingResolve = null;
        if (!configReply) return 'retry';
        try {
          const cfg = JSON.parse(String(configReply.data)) as {
            ok?: boolean;
            error?: string;
          };
          if (!cfg.ok) return 'retry';
        } catch {
          return 'retry';
        }
        if (disposed) return 'abort';

        let consecutiveNoFace = 0;

        while (!disposed && !sessionClosed && ws.readyState === WebSocket.OPEN) {
          const blob = await captureFrame(video);
          if (!blob) {
            await sleep(200);
            continue;
          }

          const event = await sendAndAwait(blob, RESPONSE_TIMEOUT_MS);

          if (event) {
            try {
              const data = JSON.parse(String(event.data)) as {
                ok?: boolean;
                error?: string;
                x?: number;
                y?: number;
              };
              if (data.ok && typeof data.x === 'number' && typeof data.y === 'number') {
                consecutiveNoFace = 0;
                onPointRef.current(data.x, data.y, 'real');
                await sleep(MIN_GAP_MS);
                continue;
              }
              if (data.error === 'no_face') {
                consecutiveNoFace += 1;
                onPointRef.current(-1, -1, 'real');
                await sleep(consecutiveNoFace > 2 ? NO_FACE_SLOW_MS : 500);
                continue;
              }
            } catch {
              // ignore
            }
            await sleep(250);
            continue;
          }

          // Timeout: reply thất bại/thất lạc → thử frame tiếp.
          await sleep(250);
        }

        return disposed ? 'abort' : 'retry';
      } catch {
        return disposed ? 'abort' : 'retry';
      } finally {
        pendingResolve = null;
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };

    const run = async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (disposed) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        setStream(media);
        streamCleanup = () => media.getTracks().forEach((track) => track.stop());

        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = media;
        await video.play().catch(() => undefined);

        const startedAt = Date.now();
        while (!disposed && video.videoWidth === 0 && Date.now() - startedAt < 4000) {
          await sleep(100);
        }
        if (disposed) return;
        if (video.videoWidth === 0) {
          streamCleanup?.();
          setStream(null);
          startSimulation();
          return;
        }

        // Tải 6 tham số hiệu chỉnh đã lưu rồi gửi vào WS /infer để stream ngay.
        const params = await fetchActiveParams();
        if (disposed) return;
        if (!params) {
          streamCleanup?.();
          setStream(null);
          startSimulation();
          return;
        }

        let attempts = 0;
        while (!disposed && attempts < MAX_RECONNECTS) {
          const result = await runWsSession(video, params);
          if (result === 'abort') return;
          attempts += 1;
          if (attempts >= MAX_RECONNECTS) break;
          await sleep(Math.min(5000, 500 * 1.5 ** attempts));
        }
        if (!disposed) {
          streamCleanup?.();
          setStream(null);
          startSimulation();
        }
      } catch {
        // Camera / AI service không khả dụng → mô phỏng để phiên vẫn chạy.
        if (!disposed) {
          streamCleanup?.();
          setStream(null);
          startSimulation();
        }
      }
    };

    if (!enabled) return;

    if (!calibrated) {
      startSimulation();
      return () => {
        disposed = true;
        window.clearInterval(simTimer);
        streamCleanup?.();
      };
    }

    const runStart = () => {
      // Defer ra khỏi effect body (tránh setState đồng bộ trong effect).
      queueMicrotask(() => {
        if (!disposed) setSource('real');
      });
      void run();
    };
    runStart();
    return () => {
      disposed = true;
      window.clearInterval(simTimer);
      streamCleanup?.();
    };
  }, [enabled, calibrated]);

  return { stream, source };
}