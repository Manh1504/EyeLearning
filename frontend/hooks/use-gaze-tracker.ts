// hooks/use-gaze-tracker.ts — Bật camera + WebSocket stream (AI server, image
// hieunm1501/gaze-api) để lấy điểm nhìn THẬT từ pipeline AI. Nếu chưa có session
// calibration (localStorage) hoặc camera / AI service không khả dụng → rơi về
// điểm mô phỏng để demo vẫn chạy.
//
// Luồng (khớp server.py /session đang chạy):
//   1. calibrated=true → đọc session id đã train từ localStorage
//      (lưu lúc calibration), mở WS /session/{sid}/stream
//   2. fire-and-forget: gửi binary JPEG đều đặn 10 FPS, không chờ response;
//      server hồi đáp bất đồng bộ {"ok","x","y"} hoặc {"ok":false,"error":"no_face"}
//      → onPoint(-1, -1) ghi "không nhìn màn".
//
// onPoint(x, y): x/y hợp lệ trong [0,1] = điểm nhìn THẬT; khi "no_face" hook
// gửi onPoint(-1, -1) để phía dưới ghi nhận "không nhìn màn" (on_slide giảm
// đúng) nhưng không đưa vào hiển thị chấm.

'use client';

import { useEffect, useRef, useState } from 'react';
import { gazeStreamUrl, getStoredGazeSessionId } from '@/lib/api/calibration';

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

const FPS = 20;
const FRAME_INTERVAL_MS = 1000 / FPS; // 100ms
const MAX_RECONNECTS = 5;              // tối đa lần thử mở lại WS trước khi về mô phỏng

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

    // Fire-and-forget: gửi frame đều đặn 10 FPS, không chờ response.
    // Server hồi đáp bất đồng bộ qua ws.onmessage; drop-frame nếu bận.
    // Trả 'retry' khi WS rớt (để ngoài thử lại), 'abort' khi component disposed.
    const runWsSession = async (
      video: HTMLVideoElement,
      url: string,
    ): Promise<'retry' | 'abort'> => {
      return new Promise<'retry' | 'abort'>((resolve) => {
        const ws = new WebSocket(url);
        let sendTimer = 0;

        const scheduleSend = () => {
          if (disposed) {
            resolve('abort');
            return;
          }
          sendTimer = window.setTimeout(async () => {
            if (disposed || ws.readyState !== WebSocket.OPEN) return;
            const blob = await captureFrame(video);
            if (blob && ws.readyState === WebSocket.OPEN) {
              ws.send(blob);
            }
            scheduleSend();
          }, FRAME_INTERVAL_MS);
        };

        ws.onopen = () => {
          if (disposed) {
            try { ws.close(); } catch { /* ignore */ }
            return;
          }
          scheduleSend();
        };

        ws.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(String(event.data)) as {
              ok?: boolean;
              error?: string;
              x?: number;
              y?: number;
            };
            if (data.ok && typeof data.x === 'number' && typeof data.y === 'number') {
              onPointRef.current(data.x, data.y, 'real');
            } else if (data.error === 'no_face') {
              onPointRef.current(-1, -1, 'real');
            }
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          window.clearTimeout(sendTimer);
          resolve(disposed ? 'abort' : 'retry');
        };

        ws.onerror = () => {
          window.clearTimeout(sendTimer);
          if (!disposed) resolve('retry');
        };
      });
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

        // Dùng session model đã train (lưu ở bước calibration) để stream ngay.
        const sessionId = getStoredGazeSessionId();
        if (disposed) return;
        if (!sessionId) {
          streamCleanup?.();
          setStream(null);
          startSimulation();
          return;
        }

        let attempts = 0;
        while (!disposed && attempts < MAX_RECONNECTS) {
          const result = await runWsSession(video, gazeStreamUrl(sessionId));
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