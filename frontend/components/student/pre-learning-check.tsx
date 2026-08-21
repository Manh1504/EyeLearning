'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  RiArrowLeftLine,
  RiCameraLine,
  RiCheckboxCircleFill,
  RiErrorWarningLine,
  RiEyeLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiUserLine,
} from '@remixicon/react';

import { Button } from '@/components/ui/button';
import { useCourseOutline } from '@/hooks/use-student';
import { checkFace, getStoredCalibration } from '@/lib/api/calibration';
import { cn } from '@/lib/utils';

type CameraState = 'idle' | 'checking' | 'ready' | 'error';
type FaceState = 'idle' | 'checking' | 'ready' | 'not-found' | 'error';

type StatusTone = 'neutral' | 'success' | 'danger';

interface StatusRowProps {
  icon: ReactNode;
  label: string;
  description: string;
  status: string;
  tone?: StatusTone;
}

function StatusRow({
  icon,
  label,
  description,
  status,
  tone = 'neutral',
}: StatusRowProps) {
  return (
    <div className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <div
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
          tone === 'success' && 'border-cyan-100 bg-cyan-50 text-cyan-700',
          tone === 'danger' && 'border-rose-100 bg-rose-50 text-rose-600',
          tone === 'neutral' && 'border-slate-200 bg-slate-50 text-slate-500',
        )}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{label}</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
          </div>

          <span
            className={cn(
              'shrink-0 pt-0.5 text-xs font-semibold',
              tone === 'success' && 'text-cyan-700',
              tone === 'danger' && 'text-rose-600',
              tone === 'neutral' && 'text-slate-500',
            )}
          >
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PreLearningCheck() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const courseId = String(params?.courseId ?? 'c1');
  const lessonId = searchParams.get('lesson');
  const { data: course } = useCourseOutline(courseId);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [faceState, setFaceState] = useState<FaceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [calibratedAt, setCalibratedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Đọc localStorage qua setTimeout để tránh setState đồng bộ trong effect
    // (quy tắc react-hooks) và tránh hydration mismatch khi SSR.
    const timer = window.setTimeout(() => {
      const stored = getStoredCalibration();
      if (cancelled) return;
      setIsCalibrated(stored.calibrated);
      setCalibratedAt(stored.calibratedAt);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const learningHref = useMemo(() => {
    const query = lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : '';
    return `/student/courses/${courseId}${query}`;
  }, [courseId, lessonId]);

  const calibrationHref = useMemo(() => {
    const query = lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : '';
    return `/student/courses/${courseId}/calibrate${query}`;
  }, [courseId, lessonId]);

  const calibrationTime = useMemo(() => {
    if (!calibratedAt) return null;

    const date = new Date(calibratedAt);
    if (Number.isNaN(date.getTime())) return null;

    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }, [calibratedAt]);

  const waitForVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return false;

    if (video.readyState >= 2 && video.videoWidth > 0) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      const timeout = window.setTimeout(() => resolve(false), 4500);

      const handleReady = () => {
        window.clearTimeout(timeout);
        resolve(video.videoWidth > 0 && video.videoHeight > 0);
      };

      video.addEventListener('loadeddata', handleReady, { once: true });
    });
  }, []);

  const captureFrame = useCallback((): Promise<Blob | null> => {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return Promise.resolve(null);
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (!context) return Promise.resolve(null);

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.88);
    });
  }, []);

  const checkCamera = useCallback(async () => {
    setCameraState('checking');
    setFaceState('checking');
    setError(null);

    streamRef.current?.getTracks().forEach((track) => track.stop());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const videoReady = await waitForVideo();
      if (!videoReady) {
        setCameraState('error');
        setFaceState('idle');
        setError('Camera đã được cấp quyền nhưng chưa trả về hình ảnh. Hãy thử lại.');
        return;
      }

      setCameraState('ready');

      // Cho camera ổn định exposure/focus trước khi lấy frame kiểm tra.
      await new Promise((resolve) => window.setTimeout(resolve, 350));

      const frame = await captureFrame();
      if (!frame) {
        setFaceState('error');
        setError('Không lấy được khung hình từ camera. Hãy thử kiểm tra lại.');
        return;
      }

      // Tạo session tạm để xác nhận khuôn mặt có thể được xử lý (mẫu không dùng lại).
      const result = await checkFace(frame);

      if (result.ok) {
        setFaceState('ready');
        return;
      }

      if (result.error === 'no_face') {
        setFaceState('not-found');
        setError('Chưa nhận diện được khuôn mặt. Hãy ngồi thẳng, nhìn vào màn hình và thử lại.');
        return;
      }

      setFaceState('error');
      setError(
        result.error === 'invalid_image' || result.error === 'network_error'
          ? 'Dịch vụ ước lượng điểm nhìn chưa sẵn sàng. Hãy thử lại sau.'
          : 'Chưa thể kiểm tra khuôn mặt. Hãy thử lại.',
      );
    } catch (caught) {
      setCameraState('error');
      setFaceState('idle');

      const message =
        caught instanceof DOMException && caught.name === 'NotAllowedError'
          ? 'Bạn chưa cấp quyền camera cho GazeEdu. Hãy cho phép camera trong trình duyệt rồi thử lại.'
          : 'Không thể truy cập camera. Hãy kiểm tra thiết bị và quyền của trình duyệt.';

      setError(message);
    }
  }, [captureFrame, waitForVideo]);

  const readyToLearn = cameraState === 'ready' && faceState === 'ready' && isCalibrated;
  const readyToCalibrate = cameraState === 'ready' && faceState === 'ready' && !isCalibrated;

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
    if (cameraState === 'checking' || faceState === 'checking') return 'Đang kiểm tra camera…';
    if (readyToLearn) return 'Bắt đầu học';
    if (readyToCalibrate) return 'Hiệu chỉnh điểm nhìn';
    if (cameraState === 'error' || faceState === 'not-found' || faceState === 'error') {
      return 'Kiểm tra lại';
    }
    return 'Kiểm tra camera';
  })();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 text-slate-900">
      <header className="h-14 shrink-0 border-b border-slate-200 bg-white">
        <div className="relative mx-auto flex h-full max-w-7xl items-center px-5 sm:px-6">
          <Link
            href="/student/my-courses"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-cyan-700"
          >
            <RiArrowLeftLine className="h-4 w-4" />
            <span className="hidden sm:inline">Khóa học của tôi</span>
          </Link>

          <p className="pointer-events-none absolute left-1/2 max-w-[46%] -translate-x-1/2 truncate text-sm font-semibold text-slate-800">
            {course?.title ?? 'Khóa học'}
          </p>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        <div className="mx-auto flex min-h-full w-full max-w-6xl items-center px-5 py-6 sm:px-6 lg:py-7">
          <div className="grid w-full gap-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)] lg:items-center lg:gap-10">
            {/* Camera / instruction */}
            <section className="min-w-0">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">
                  Trước khi bắt đầu
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.75rem]">
                  Kiểm tra camera và điểm nhìn
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Đảm bảo khuôn mặt nằm rõ trong khung hình để hệ thống ghi nhận điểm nhìn ổn định trong bài học.
                </p>
              </div>

              <div className="relative h-[clamp(250px,36vh,330px)] overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-sm">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  className={cn(
                    'h-full w-full scale-x-[-1] object-cover transition-opacity duration-200',
                    cameraState === 'idle' || cameraState === 'error' ? 'opacity-0' : 'opacity-100',
                  )}
                />

                {cameraState === 'idle' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15">
                      <RiCameraLine className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-white">Camera chưa được kiểm tra</p>
                    <p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-300">
                      Nhấn “Kiểm tra camera” để cấp quyền và xem trước khung hình.
                    </p>
                  </div>
                )}

                {cameraState === 'checking' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35">
                    <div className="rounded-lg bg-slate-950/70 px-3 py-2 text-xs font-medium text-white backdrop-blur-sm">
                      Đang kiểm tra…
                    </div>
                  </div>
                )}

                {cameraState === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15">
                      <RiErrorWarningLine className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-white">Chưa thể sử dụng camera</p>
                    <p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-300">
                      Kiểm tra quyền camera của trình duyệt rồi thử lại.
                    </p>
                  </div>
                )}

                {/* Face guide chỉ hiện khi có video, không quá nổi để tránh gây phân tâm. */}
                {(cameraState === 'checking' || cameraState === 'ready') && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div
                      className={cn(
                        'h-[68%] max-h-[235px] w-[36%] min-w-[150px] max-w-[190px] rounded-[44%] border-2 transition-colors',
                        faceState === 'ready'
                          ? 'border-cyan-300/80'
                          : faceState === 'not-found' || faceState === 'error'
                            ? 'border-rose-300/80'
                            : 'border-white/45',
                      )}
                    />
                  </div>
                )}

                {faceState === 'ready' && (
                  <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/65 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                    <RiCheckboxCircleFill className="h-4 w-4 text-cyan-300" />
                    Khuôn mặt đã sẵn sàng
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
                <RiShieldCheckLine className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p>
                  Video từ camera chỉ được dùng để ước lượng điểm nhìn trong phiên học và không được lưu lại.
                </p>
              </div>
            </section>

            {/* Readiness panel */}
            <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div>
                <h2 className="text-base font-bold text-slate-950">Sẵn sàng bắt đầu</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Hoàn tất các kiểm tra dưới đây trước khi mở bài học.
                </p>
              </div>

              <div className="mt-5 divide-y divide-slate-100">
                <StatusRow
                  icon={<RiCameraLine className="h-4 w-4" />}
                  label="Camera"
                  description="Trình duyệt có thể lấy hình ảnh từ camera."
                  status={
                    cameraState === 'checking'
                      ? 'Đang kiểm tra'
                      : cameraState === 'ready'
                        ? 'Sẵn sàng'
                        : cameraState === 'error'
                          ? 'Có lỗi'
                          : 'Chưa kiểm tra'
                  }
                  tone={
                    cameraState === 'ready'
                      ? 'success'
                      : cameraState === 'error'
                        ? 'danger'
                        : 'neutral'
                  }
                />

                <StatusRow
                  icon={<RiUserLine className="h-4 w-4" />}
                  label="Khuôn mặt"
                  description="Khuôn mặt có thể được pipeline gaze xử lý."
                  status={
                    faceState === 'checking'
                      ? 'Đang nhận diện'
                      : faceState === 'ready'
                        ? 'Đã phát hiện'
                        : faceState === 'not-found'
                          ? 'Chưa phát hiện'
                          : faceState === 'error'
                            ? 'Có lỗi'
                            : 'Chưa kiểm tra'
                  }
                  tone={
                    faceState === 'ready'
                      ? 'success'
                      : faceState === 'not-found' || faceState === 'error'
                        ? 'danger'
                        : 'neutral'
                  }
                />

                <StatusRow
                  icon={<RiEyeLine className="h-4 w-4" />}
                  label="Hiệu chỉnh điểm nhìn"
                  description={
                    isCalibrated
                      ? calibrationTime
                        ? `Đã hiệu chỉnh trên thiết bị này lúc ${calibrationTime}.`
                        : 'Đã có dữ liệu hiệu chỉnh trên thiết bị này.'
                      : 'Cần thực hiện một lần trước khi bắt đầu theo dõi.'
                  }
                  status={isCalibrated ? 'Đã hiệu chỉnh' : 'Cần hiệu chỉnh'}
                  tone={isCalibrated ? 'success' : 'neutral'}
                />
              </div>

              {error && (
                <div className="mt-5 flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700">
                  <RiErrorWarningLine className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="mt-6">
                <Button
                  size="lg"
                  onClick={handlePrimaryAction}
                  disabled={cameraState === 'checking' || faceState === 'checking'}
                  className="w-full"
                >
                  {(cameraState === 'error' || faceState === 'not-found' || faceState === 'error') && (
                    <RiRefreshLine data-icon="inline-start" />
                  )}
                  {readyToLearn && <RiEyeLine data-icon="inline-start" />}
                  {primaryLabel}
                </Button>

                {isCalibrated && faceState === 'ready' && (
                  <Link
                    href={calibrationHref}
                    className="mt-3 flex h-8 items-center justify-center text-xs font-medium text-slate-500 transition-colors hover:text-cyan-700"
                  >
                    Hiệu chỉnh lại điểm nhìn
                  </Link>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

