"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import {
  checkFace,
  clearStoredGazeSession,
  fetchActiveCalibration,
  getGazeSessionStatus,
  getStoredCalibration,
  getStoredGazeSessionId,
  isCalibrationScreenStale,
} from "@/lib/api/calibration";
import { getDeviceFingerprint } from "@/lib/api/student";
import { useCourseOutline } from "@/hooks/use-student";
import { cn } from "@/lib/utils";

type CameraState = "idle" | "checking" | "ready" | "error";
type FaceState = "idle" | "checking" | "ready" | "not-found" | "error";
type Tone = "neutral" | "success" | "danger" | "warning";

function StatusRow({
  icon,
  label,
  description,
  status,
  tone = "neutral",
}: {
  icon: string;
  label: string;
  description: string;
  status: string;
  tone?: Tone;
}) {
  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-3 py-4 first:pt-0 last:pb-0">
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-full border",
          tone === "success" && "border-[#d8e7d5] bg-[#e8f1e6] text-[#52704f]",
          (tone === "danger" || tone === "warning") && "border-border bg-[#f5f6f2] text-foreground",
          tone === "neutral" && "border-border bg-[#f5f6f2] text-muted-foreground",
        )}
      >
        <Icon name={icon} className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <span className={cn(
        "mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
        tone === "success" ? "bg-[#e8f1e6] text-[#52704f]" : "bg-[#f5f6f2] text-foreground",
      )}>
        {status}
      </span>
    </div>
  );
}

export function PreflightCheck({
  courseId,
}: {
  courseId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lessonId = searchParams.get("lesson");
  const { data: course } = useCourseOutline(courseId);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [faceState, setFaceState] = useState<FaceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [calibratedAt, setCalibratedAt] = useState<string | null>(null);
  const [sessionIssue, setSessionIssue] = useState<string | null>(null);
  const [screenStale, setScreenStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const stored = getStoredCalibration();
        const sid = getStoredGazeSessionId();
        if (!sid) {
          const active = await fetchActiveCalibration(getDeviceFingerprint());
          if (cancelled) return;
          const ageDays = active?.calibratedAt
            ? (Date.now() - new Date(active.calibratedAt).getTime()) / 86400000
            : Number.POSITIVE_INFINITY;
          setIsCalibrated(false);
          setCalibratedAt(active?.calibrated && ageDays < 30 ? active.calibratedAt : null);
          setSessionIssue(
            active?.calibrated && ageDays < 30
              ? "Thiết bị có bản ghi hiệu chỉnh gần đây, nhưng không có phiên theo dõi cục bộ đang hoạt động. Vui lòng hiệu chỉnh lại để tạo phiên mới trước khi học."
              : "Không có phiên theo dõi cục bộ đang hoạt động. Vui lòng hiệu chỉnh điểm nhìn trước khi học.",
          );
          return;
        }
        const status = await getGazeSessionStatus(sid);
        if (cancelled) return;
        if (!status.ready) {
          const fp = getDeviceFingerprint();
          const active = await fetchActiveCalibration(fp);
          if (active?.calibrated && active.calibratedAt) {
            const ageDays = (Date.now() - new Date(active.calibratedAt).getTime()) / 86400000;
            if (ageDays < 30) {
              clearStoredGazeSession();
              setIsCalibrated(false);
              setCalibratedAt(active.calibratedAt);
              setScreenStale(false);
              setSessionIssue(
                "Thiết bị có bản ghi hiệu chỉnh trong 30 ngày, nhưng phiên theo dõi cục bộ không còn hoạt động. Vui lòng hiệu chỉnh lại để tạo phiên mới trước khi học.",
              );
              return;
            }
          }
          clearStoredGazeSession();
          setIsCalibrated(false);
          setCalibratedAt(null);
          setScreenStale(false);
          setSessionIssue(
            status.error === "network_error"
              ? "Không kết nối được dịch vụ theo dõi để kiểm tra phiên hiệu chỉnh — hãy hiệu chỉnh lại trước khi học."
              : "Phiên hiệu chỉnh cũ đã hết hạn trên máy chủ — vui lòng hiệu chỉnh lại trước khi học.",
          );
          return;
        }
        setIsCalibrated(true);
        setCalibratedAt(stored.calibratedAt);
        setScreenStale(isCalibrationScreenStale());
        setSessionIssue(null);
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const learningHref = useMemo(() => {
    const q = lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : "";
    return `/student/courses/${courseId}${q}`;
  }, [courseId, lessonId]);

  const calibrationHref = useMemo(() => {
    const q = lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : "";
    return `/student/courses/${courseId}/calibrate${q}`;
  }, [courseId, lessonId]);

  const calibrationTime = useMemo(() => {
    if (!calibratedAt) return null;
    const date = new Date(calibratedAt);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }, [calibratedAt]);

  const waitForVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return false;
    if (video.readyState >= 2 && video.videoWidth > 0) return true;
    return new Promise<boolean>((resolve) => {
      const timeout = window.setTimeout(() => resolve(false), 4500);
      const handleReady = () => {
        window.clearTimeout(timeout);
        resolve(video.videoWidth > 0 && video.videoHeight > 0);
      };
      video.addEventListener("loadeddata", handleReady, { once: true });
    });
  }, []);

  const captureFrame = useCallback((): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return Promise.resolve(null);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88));
  }, []);

  const checkCamera = useCallback(async () => {
    setCameraState("checking");
    setFaceState("checking");
    setError(null);
    streamRef.current?.getTracks().forEach((track) => track.stop());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      const videoReady = await waitForVideo();
      if (!videoReady) {
        setCameraState("error");
        setFaceState("idle");
        setError("Camera đã được cấp quyền nhưng chưa trả về hình ảnh. Hãy thử lại.");
        return;
      }
      setCameraState("ready");
      await new Promise((resolve) => window.setTimeout(resolve, 350));

      const frame = await captureFrame();
      if (!frame) {
        setFaceState("error");
        setError("Không lấy được khung hình từ camera. Hãy thử kiểm tra lại.");
        return;
      }
      const result = await checkFace(frame);
      if (result.ok) {
        setFaceState("ready");
        return;
      }
      if (result.error === "no_face") {
        setFaceState("not-found");
        setError("Chưa nhận diện được khuôn mặt. Hãy ngồi thẳng, nhìn vào màn hình và thử lại.");
        return;
      }
      setFaceState("error");
      setError(
        result.error === "invalid_image" || result.error === "network_error"
          ? "Dịch vụ ước lượng điểm nhìn chưa sẵn sàng. Hãy thử lại sau."
          : "Chưa thể kiểm tra khuôn mặt. Hãy thử lại.",
      );
    } catch (caught) {
      setCameraState("error");
      setFaceState("idle");
      setError(
        caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "Bạn chưa cấp quyền camera cho GazeEdu. Hãy cho phép camera trong trình duyệt rồi thử lại."
          : "Không thể truy cập camera. Hãy kiểm tra thiết bị và quyền của trình duyệt.",
      );
    }
  }, [captureFrame, waitForVideo]);

  const readyToLearn = cameraState === "ready" && faceState === "ready" && isCalibrated;
  const readyToCalibrate = cameraState === "ready" && faceState === "ready" && !isCalibrated;

  const handlePrimaryAction = () => {
    if (readyToLearn) {
      router.push(learningHref);
      return;
    }
    if (readyToCalibrate) {
      router.push(calibrationHref);
      return;
    }
    void checkCamera();
  };

  const primaryLabel = (() => {
    if (cameraState === "checking" || faceState === "checking") return "Đang kiểm tra camera…";
    if (readyToLearn) return "Bắt đầu học";
    if (readyToCalibrate) return "Hiệu chỉnh điểm nhìn";
    if (cameraState === "error" || faceState === "not-found" || faceState === "error")
      return "Kiểm tra lại";
    return "Kiểm tra camera";
  })();

  return (
    <div className="mx-auto w-full max-w-6xl pb-6">
      <div className="mb-8 flex min-w-0 items-center justify-between gap-4">
        <Link
          href="/student"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:border-foreground/20 hover:text-foreground"
        >
          <Icon name="ri-arrow-left-line" className="size-4" />
          Quay lại
        </Link>
        {course?.title && (
          <span className="truncate text-xs font-medium text-muted-foreground">{course.title}</span>
        )}
      </div>

      <div className="mb-7 max-w-2xl">
        <span className="inline-flex rounded-full bg-[#e8f1e6] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#52704f]">
          Kiểm tra trước phiên học
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
          Thiết lập một vùng học ổn định.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          Giữ khuôn mặt trong khung, ánh sáng đều và nhìn thẳng vào màn hình để điểm nhìn được ghi nhận chính xác.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.72fr)] lg:items-stretch">
        <section className="min-w-0 rounded-[20px] border border-border/80 bg-white p-2 shadow-sm sm:p-3">
          <div className="relative aspect-video overflow-hidden rounded-[16px] bg-[#111111]">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className={cn(
                "h-full w-full scale-x-[-1] object-cover transition-opacity duration-200",
                cameraState === "idle" || cameraState === "error" ? "opacity-0" : "opacity-100",
              )}
            />

            {(cameraState === "idle" || cameraState === "error") && (
              <div className="absolute inset-0 grid place-items-center px-6 text-center">
                <div>
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-white/20 text-white">
                    <Icon
                      name={cameraState === "error" ? "ri-error-warning-line" : "ri-camera-line"}
                      className="size-5"
                    />
                  </div>
                  <p className="mt-4 text-sm font-medium text-white">
                    {cameraState === "error" ? "Camera chưa sẵn sàng" : "Camera đang tắt"}
                  </p>
                  <p className="mx-auto mt-1.5 max-w-xs text-xs leading-5 text-white/55">
                    {cameraState === "error"
                      ? "Kiểm tra quyền truy cập của trình duyệt rồi thử lại."
                      : "Bật camera để kiểm tra vị trí khuôn mặt trước khi vào bài."}
                  </p>
                </div>
              </div>
            )}

            {cameraState === "checking" && (
              <div className="absolute inset-0 grid place-items-center bg-black/25">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                  <Spinner className="text-white" />
                  Đang kiểm tra
                </span>
              </div>
            )}

            {(cameraState === "checking" || cameraState === "ready") && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={cn(
                    "h-[68%] max-h-[260px] w-[36%] min-w-[140px] max-w-[190px] rounded-[46%] border transition-colors",
                    faceState === "ready" ? "border-white" : "border-white/40",
                    (faceState === "not-found" || faceState === "error") && "border-white/70 border-dashed",
                  )}
                />
              </div>
            )}

            <div className="absolute left-3 top-3 flex items-center gap-2">
              <span className="rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/75 backdrop-blur-sm">
                Xem trước trực tiếp
              </span>
            </div>

            {faceState === "ready" && (
              <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 text-[11px] font-medium text-black">
                <Icon name="ri-checkbox-circle-fill" className="size-3.5" />
                Khuôn mặt ổn định
              </div>
            )}
          </div>
          <div className="flex items-start gap-2 px-2 pb-1 pt-3 text-xs leading-5 text-muted-foreground">
            <Icon name="ri-lock-line" className="mt-0.5 size-4 shrink-0" />
            <p>Hình ảnh camera chỉ được xử lý trong phiên để ước lượng điểm nhìn và không được lưu lại.</p>
          </div>
        </section>

        <aside className="flex flex-col rounded-[20px] border border-border/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Trạng thái</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Sẵn sàng vào bài</h2>
            </div>
            <span className="flex size-9 items-center justify-center rounded-full bg-[#e8f1e6] text-[#52704f]">
              <Icon name="ri-equalizer-2-line" className="size-4" />
            </span>
          </div>

          <div className="mt-6 divide-y divide-border">
            <StatusRow
              icon="ri-eye-line"
              label="Camera"
              description="Trình duyệt có thể lấy hình ảnh từ camera."
              status={
                cameraState === "checking"
                  ? "Đang kiểm tra"
                  : cameraState === "ready"
                    ? "Sẵn sàng"
                    : cameraState === "error"
                      ? "Có lỗi"
                      : "Chưa kiểm tra"
              }
              tone={
                cameraState === "ready" ? "success" : cameraState === "error" ? "danger" : "neutral"
              }
            />
            <StatusRow
              icon="ri-user-line"
              label="Khuôn mặt"
              description="Khuôn mặt có thể được pipeline gaze xử lý."
              status={
                faceState === "checking"
                  ? "Đang nhận diện"
                  : faceState === "ready"
                    ? "Đã phát hiện"
                    : faceState === "not-found"
                      ? "Chưa phát hiện"
                      : faceState === "error"
                        ? "Có lỗi"
                        : "Chưa kiểm tra"
              }
              tone={
                faceState === "ready"
                  ? "success"
                  : faceState === "not-found" || faceState === "error"
                    ? "danger"
                    : "neutral"
              }
            />
            <StatusRow
              icon="ri-focus-2-line"
              label="Hiệu chỉnh điểm nhìn"
              description={
                isCalibrated
                  ? calibrationTime
                    ? `Đã hiệu chỉnh trên thiết bị này lúc ${calibrationTime}.`
                    : "Đã có dữ liệu hiệu chỉnh trên thiết bị này."
                  : calibrationTime
                    ? `Có bản ghi hiệu chỉnh lúc ${calibrationTime}, nhưng cần phiên cục bộ mới để theo dõi.`
                    : "Cần tạo phiên hiệu chỉnh cục bộ trước khi bắt đầu theo dõi."
              }
              status={isCalibrated ? "Phiên sẵn sàng" : "Cần hiệu chỉnh"}
              tone={isCalibrated ? "success" : "neutral"}
            />
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-border/80 bg-[#f5f6f2] px-3 py-2.5 text-xs leading-5 text-foreground">
              <Icon name="ri-error-warning-line" className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
          {sessionIssue && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-border/80 bg-[#f5f6f2] px-3 py-2.5 text-xs leading-5 text-foreground">
              <Icon name="ri-error-warning-line" className="mt-0.5 size-4 shrink-0" />
              <p>{sessionIssue}</p>
            </div>
          )}
          {screenStale && isCalibrated && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-border/80 bg-[#f5f6f2] px-3 py-2.5 text-xs leading-5 text-foreground">
              <Icon name="ri-error-warning-line" className="mt-0.5 size-4 shrink-0" />
              <p>
                Kích thước màn hình/cửa sổ đã đổi so với lúc hiệu chỉnh — điểm nhìn có thể bị lệch.
                Nên hiệu chỉnh lại trước khi học.
              </p>
            </div>
          )}

          <div className="mt-auto space-y-2 pt-6">
            <Button
              size="lg"
              onClick={handlePrimaryAction}
              disabled={cameraState === "checking" || faceState === "checking"}
              className="w-full bg-black text-white shadow-xs hover:bg-[#292a27]"
            >
              {(cameraState === "checking" || faceState === "checking") && <Spinner />}
              {readyToLearn && <Icon name="ri-play-circle-line" className="size-5" />}
              {primaryLabel}
            </Button>

            {isCalibrated && (
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link href={calibrationHref}>
                  <Icon name="ri-focus-2-line" />
                  Hiệu chỉnh lại điểm nhìn
                </Link>
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
