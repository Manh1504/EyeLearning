"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildCalibrationPoints,
  bytesToBase64,
  clearStoredGazeSession,
  createGazeSession,
  deleteGazeSession,
  downloadGazeModel,
  saveCalibrationToBackend,
  storeGazeSession,
  submitCalibrationSample,
  trainGazeSession,
  type CalPoint,
} from "@/lib/api/calibration";
import { getDeviceFingerprint } from "@/lib/api/student";

const SAMPLES_PER_POINT = 1;
const MAX_CAPTURES_PER_POINT = 5;
const CAPTURE_GAP_MS = 100;

export type CalibrationPhase = "idle" | "calibrating" | "sending" | "training";

export interface CalibrationEngine {
  points: CalPoint[];
  current: CalPoint;
  step: number;
  total: number;
  progress: number;
  phase: CalibrationPhase;
  busy: boolean;
  error: string | null;
  camOn: boolean;
  sessionReady: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  attachVideo: (el: HTMLVideoElement | null) => void;
  handleDotClick: () => Promise<void>;
  reset: () => void;
  retrain: () => Promise<void>;
}

const ERROR_TEXT: Record<string, string> = {
  no_face: "Không phát hiện khuôn mặt — hãy nhìn thẳng vào chấm đỏ rồi bấm lại.",
  invalid_image: "Ảnh webcam không hợp lệ — bấm lại.",
  no_camera: "Camera không khả dụng — hãy cho phép camera rồi tải lại trang.",
  network_error: "Không kết nối được dịch vụ AI — kiểm tra kết nối rồi bấm lại.",
  insufficient: "Chưa đủ mẫu cho điểm này — hãy bấm lại và giữ nhìn vào chấm.",
};

export interface UseCalibrationOptions {
  /** Gọi khi train thành công; nhận maePx để caller quyết định điều hướng. */
  onComplete: (result: { maePx: number | null }) => void;
  /** Lưu lên Postgres theo device (chỉ học viên). Mặc định true. */
  persistToBackend?: boolean;
}

export function useCalibration({ onComplete, persistToBackend = true }: UseCalibrationOptions): CalibrationEngine {
  const points = useMemo<CalPoint[]>(() => buildCalibrationPoints(), []);
  const total = points.length;

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<CalibrationPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionNonce, setSessionNonce] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => undefined);
    }
  }, []);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    let cancelled = false;
    createGazeSession(points)
      .then((res) => {
        if (!cancelled && res.ok && res.sessionId) {
          setSessionId(res.sessionId);
          setPhase("calibrating");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [points, sessionNonce]);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
        setCamOn(true);
      })
      .catch(() => setCamOn(false));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const reset = useCallback(() => {
    setSessionId((prev) => {
      if (prev) deleteGazeSession(prev);
      return null;
    });
    clearStoredGazeSession();
    setError(null);
    setIdx(0);
    setPhase("idle");
    setSessionNonce((v) => v + 1);
  }, []);

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video) return null;
    let waited = 0;
    while (video.videoWidth === 0 && waited < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waited += 50;
    }
    if (video.videoWidth === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? null), "image/jpeg", 0.9));
  }, []);

  const finish = useCallback(async () => {
    if (!sessionId) return;
    setPhase("training");
    const trained = await trainGazeSession(sessionId);
    if (!trained.ok) {
      const message =
        trained.error === "insufficient_samples"
          ? `${ERROR_TEXT.insufficient} — sẽ làm lại từ đầu.`
          : trained.error === "network_error"
            ? "Không kết nối được dịch vụ AI khi huấn luyện — sẽ làm lại từ đầu."
            : "Không huấn luyện được bộ hiệu chỉnh — sẽ làm lại từ đầu.";
      reset();
      setError(message);
      return;
    }
    storeGazeSession(sessionId, window.innerWidth, window.innerHeight);
    if (persistToBackend) {
      // Lưu model .ubj để lần sau khôi phục không cần hiệu chỉnh lại
      const model = await downloadGazeModel(sessionId);
      if (model) {
        await saveCalibrationToBackend({
          deviceFingerprint: getDeviceFingerprint(),
          numPoints: points.length,
          modelUbjBase64: bytesToBase64(model),
          maePx: trained.maePx ?? null,
          screenWidth: window.innerWidth,
          screenHeight: window.innerHeight,
        });
      }
    }
    onCompleteRef.current({ maePx: trained.maePx ?? null });
  }, [sessionId, reset, persistToBackend, points]);

  const handleDotClick = useCallback(async () => {
    if (phase !== "calibrating") return;
    if (!sessionId) {
      setError("Dịch vụ AI chưa sẵn sàng — hãy thử lại sau một nhịp.");
      return;
    }
    setPhase("sending");
    setError(null);

    if (!camOn) {
      setPhase("calibrating");
      setError(ERROR_TEXT.no_camera);
      return;
    }

    const point = points[idx];
    let accepted = 0;
    let failed: string | null = null;

    for (
      let attempt = 0;
      attempt < MAX_CAPTURES_PER_POINT && accepted < SAMPLES_PER_POINT;
      attempt++
    ) {
      const frame = await captureFrame();
      if (frame === null) {
        failed = "no_camera";
        break;
      }
      const result = await submitCalibrationSample(sessionId, frame, point.id);
      if (result.status === "accepted") {
        accepted += 1;
      } else if (result.status === "no_face" || result.status === "invalid_image") {
        failed = result.status;
        break;
      } else {
        failed = "network_error";
        break;
      }
      if (accepted < SAMPLES_PER_POINT) {
        await new Promise((r) => setTimeout(r, CAPTURE_GAP_MS));
      }
    }

    if (accepted < SAMPLES_PER_POINT) {
      setPhase("calibrating");
      setError(failed ? (ERROR_TEXT[failed] ?? "Gửi điểm thất bại — bấm lại.") : ERROR_TEXT.insufficient);
      return;
    }

    if (idx === total - 1) {
      await finish();
      return;
    }
    setIdx(idx + 1);
    setPhase("calibrating");
  }, [phase, sessionId, camOn, points, idx, total, captureFrame, finish]);

  const progress = ((idx + (phase === "training" ? 1 : 0)) / total) * 100;

  return {
    points,
    current: points[idx],
    step: idx,
    total,
    progress,
    phase,
    busy: phase === "sending" || phase === "training",
    error,
    camOn,
    sessionReady: Boolean(sessionId),
    videoRef,
    attachVideo,
    handleDotClick,
    reset,
    retrain: finish,
  };
}
