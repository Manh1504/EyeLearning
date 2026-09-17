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
import { Card, CardContent } from '@/components/ui/card';
import { useCourseOutline } from '@/hooks/use-student';
import {
  checkFace,
  clearStoredGazeSession,
  fetchActiveCalibration,
  getGazeSessionStatus,
  getStoredCalibration,
  getStoredGazeSessionId,
  isCalibrationScreenStale,
} from '@/lib/api/calibration';
import { getDeviceFingerprint } from '@/lib/api/student';
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
    <div className="flex items-start gap-4 py-5 first:pt-0 last:pb-0">
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
          tone === 'success' && 'border-primary/20 bg-primary/10 text-primary',
          tone === 'danger' && 'border-destructive/20 bg-destructive/10 text-destructive',
          tone === 'neutral' && 'border-border bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>

          <span
            className={cn(
              'shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
              tone === 'success' && 'bg-primary/10 text-primary',
              tone === 'danger' && 'bg-destructive/10 text-destructive',
              tone === 'neutral' && 'bg-muted text-muted-foreground',
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
  const [sessionIssue, setSessionIssue] = useState<string | null>(null);
  const [screenStale, setScreenStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const stored = getStoredCalibration();
        if (cancelled) return;
        if (!stored.calibrated) {
          const fp0 = getDeviceFingerprint();
          const active0 = await fetchActiveCalibration(fp0);
          if (active0?.calibrated && active0.calibratedAt) {
            const ageDays0 = (Date.now() - new Date(active0.calibratedAt).getTime()) / 86400000;
            if (ageDays0 < 30) {
              setIsCalibrated(true);
              setCalibratedAt(active0.calibratedAt);
              setScreenStale(isCalibrationScreenStale());
              return;
            }
          }
          setIsCalibrated(false);
          setCalibratedAt(null);
          return;
        }
        const sid = getStoredGazeSessionId();
        if (!sid) {
          const fp1 = getDeviceFingerprint();
          const active1 = await fetchActiveCalibration(fp1);
          if (active1?.calibrated && active1.calibratedAt) {
            const ageDays1 = (Date.now() - new Date(active1.calibratedAt).getTime()) / 86400000;
            if (ageDays1 < 30) {
              setIsCalibrated(true);
              setCalibratedAt(active1.calibratedAt);
              setScreenStale(isCalibrationScreenStale());
              return;
            }
          }
          setIsCalibrated(false);
          setCalibratedAt(null);
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
              setIsCalibrated(true);
              setCalibratedAt(active.calibratedAt);
              setScreenStale(isCalibrationScreenStale());
              setSessionIssue(
                'Phiên AI đã hết hạn nhưng vẫn còn hiệu chỉnh trong 30 ngày — sẽ thực hiện kiểm tra nhanh 3-5 điểm trước khi học.',
              );
              return;
            }
          }
          clearStoredGazeSession();
          setIsCalibrated(false);
          setCalibratedAt(null);
          setScreenStale(false);
          setSessionIssue(
            status.error === 'network_error'
              ? 'Không kết nối được dịch vụ theo dõi để kiểm tra phiên hiệu chỉnh — hãy hiệu chỉnh lại trước khi học.'
              : 'Phiên hiệu chỉnh cũ đã hết hạn trên máy chủ — vui lòng hiệu chỉnh lại trước khi học.',
          );
          return;
        }
        setIsCalibrated(true);
        setCalibratedAt(stored.calibratedAt);
        setScreenStale(isCalibrationScreenStale());
      })();
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
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
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
      video.addEventListener('loadeddata', handleReady, { once: true });
    });
  }, []);

  const captureFrame = useCallback((): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return Promise.resolve(null);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return Promise.resolve(null);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.88);
    });
  }, []);

  const checkCamera = useCallback(async () => {
    setCameraState('checking'); setFaceState('checking'); setError(null);
    streamRef.current?.getTracks().forEach((track) => track.stop());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      const videoReady = await waitForVideo();
      if (!videoReady) {
        setCameraState('error'); setFaceState('idle');
        setError('Camera đã được cấp quyền nhưng chưa trả về hình ảnh. Hãy thử lại.');
        return;
      }
      setCameraState('ready');
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const frame = await captureFrame();
      if (!frame) {
        setFaceState('error');
        setError('Không lấy được khung hình từ camera. Hãy thử kiểm tra lại.');
        return;
      }
      const result = await checkFace(frame);
      if (result.ok) { setFaceState('ready'); return; }
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
      setCameraState('error'); setFaceState('idle');
      const message = caught instanceof DOMException && caught.name === 'NotAllowedError'
        ? 'Bạn chưa cấp quyền camera cho GazeEdu. Hãy cho phép camera trong trình duyệt rồi thử lại.'
        : 'Không thể truy cập camera. Hãy kiểm tra thiết bị và quyền của trình duyệt.';
      setError(message);
    }
  }, [captureFrame, waitForVideo]);

  const readyToLearn = cameraState === 'ready' && faceState === 'ready' && isCalibrated;
  const readyToCalibrate = cameraState === 'ready' && faceState === 'ready' && !isCalibrated;

  const handlePrimaryAction = () => {
    if (readyToLearn) { router.push(learningHref); return; }
    if (readyToCalibrate) { router.push(calibrationHref); return; }
    void checkCamera();
  };

  const primaryLabel = (() => {
    if (cameraState === 'checking' || faceState === 'checking') return 'Đang kiểm tra camera…';
    if (readyToLearn) return 'Bắt đầu học';
    if (readyToCalibrate) return 'Hiệu chỉnh điểm nhìn';
    if (cameraState === 'error' || faceState === 'not-found' || faceState === 'error') return 'Kiểm tra lại';
    return 'Kiểm tra camera';
  })();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="h-16 shrink-0 border-b border-border bg-card shadow-sm sticky top-0 z-10">
        <div className="relative mx-auto flex h-full max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link
            href="/student/my-courses"
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RiArrowLeftLine className="h-4 w-4" />
            <span className="hidden sm:inline">Khóa học của tôi</span>
          </Link>

          <p className="pointer-events-none absolute left-1/2 max-w-[46%] -translate-x-1/2 truncate text-sm font-bold text-foreground">
            {course?.title ?? 'Đang tải khóa học...'}
          </p>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden bg-muted/30">
        <div className="mx-auto flex min-h-full w-full max-w-6xl items-center px-4 py-8 sm:px-6 lg:py-12">
          <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-start lg:gap-12">
            
            {/* Camera / instruction */}
            <section className="flex flex-col gap-6">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-3">
                  <RiCameraLine className="h-3.5 w-3.5" /> Chuẩn bị
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Kiểm tra môi trường học
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Để theo dõi điểm nhìn chính xác, hãy đảm bảo bạn đang ngồi ở nơi đủ sáng và khuôn mặt nằm rõ trong khung hình.
                </p>
              </div>

              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-slate-900 shadow-sm">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  className={cn(
                    'h-full w-full scale-x-[-1] object-cover transition-opacity duration-300',
                    cameraState === 'idle' || cameraState === 'error' ? 'opacity-0' : 'opacity-100',
                  )}
                />

                {cameraState === 'idle' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center bg-slate-900/50 backdrop-blur-sm">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20">
                      <RiCameraLine className="h-8 w-8" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-white">Camera chưa kết nối</p>
                    <p className="mt-2 max-w-sm text-sm text-slate-300">
                      Nhấn nút bên phải để cấp quyền truy cập.
                    </p>
                  </div>
                )}

                {cameraState === 'checking' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
                    <div className="flex items-center gap-3 rounded-full bg-slate-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Đang kiểm tra...
                    </div>
                  </div>
                )}

                {cameraState === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center bg-slate-900/50 backdrop-blur-sm">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/20 text-red-400 ring-1 ring-red-500/30">
                      <RiErrorWarningLine className="h-8 w-8" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-white">Lỗi truy cập Camera</p>
                    <p className="mt-2 max-w-sm text-sm text-slate-300">
                      Vui lòng kiểm tra quyền trên trình duyệt.
                    </p>
                  </div>
                )}

                {(cameraState === 'checking' || cameraState === 'ready') && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                    <div
                      className={cn(
                        'h-full max-h-[300px] w-full max-w-[220px] rounded-[100px] border-2 transition-all duration-300',
                        faceState === 'ready'
                          ? 'border-emerald-400/80 bg-emerald-400/10'
                          : faceState === 'not-found' || faceState === 'error'
                            ? 'border-red-400/80 bg-red-400/10'
                            : 'border-white/30 border-dashed',
                      )}
                    />
                  </div>
                )}

                {faceState === 'ready' && (
                  <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-xl bg-slate-900/80 px-3 py-2 text-sm font-medium text-white backdrop-blur-md">
                    <RiCheckboxCircleFill className="h-4 w-4 text-emerald-400" />
                    Khuôn mặt hợp lệ
                  </div>
                )}
              </div>

              <div className="flex items-start gap-3 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                <RiShieldCheckLine className="h-5 w-5 shrink-0 text-primary" />
                <p>
                  GazeEdu xử lý phân tích điểm nhìn trực tiếp trên thiết bị của bạn. Không có video hay hình ảnh nào được lưu trữ hay gửi lên máy chủ.
                </p>
              </div>
            </section>

            {/* Readiness panel */}
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-6 sm:p-8">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Trạng thái hệ thống</h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Cần hoàn thành các bước sau để học.
                  </p>
                </div>

                <div className="mt-8 divide-y divide-border">
                  <StatusRow
                    icon={<RiCameraLine className="h-5 w-5" />}
                    label="Kết nối Camera"
                    description="Cấp quyền truy cập để phân tích điểm nhìn."
                    status={
                      cameraState === 'checking' ? 'Đang kiểm tra'
                        : cameraState === 'ready' ? 'Đã kết nối'
                        : cameraState === 'error' ? 'Lỗi kết nối'
                        : 'Chờ kiểm tra'
                    }
                    tone={cameraState === 'ready' ? 'success' : cameraState === 'error' ? 'danger' : 'neutral'}
                  />

                  <StatusRow
                    icon={<RiUserLine className="h-5 w-5" />}
                    label="Nhận diện khuôn mặt"
                    description="Đảm bảo ánh sáng tốt, mặt ở giữa khung hình."
                    status={
                      faceState === 'checking' ? 'Đang phân tích'
                        : faceState === 'ready' ? 'Hoàn tất'
                        : faceState === 'not-found' ? 'Không thấy'
                        : faceState === 'error' ? 'Lỗi xử lý'
                        : 'Chờ kiểm tra'
                    }
                    tone={faceState === 'ready' ? 'success' : faceState === 'not-found' || faceState === 'error' ? 'danger' : 'neutral'}
                  />

                  <StatusRow
                    icon={<RiEyeLine className="h-5 w-5" />}
                    label="Hiệu chỉnh AI"
                    description={
                      isCalibrated
                        ? (calibrationTime ? `Lần cuối: ${calibrationTime}` : 'Đã có dữ liệu chuẩn.')
                        : 'Cần thực hiện bài tập nhìn điểm đỏ (30s).'
                    }
                    status={isCalibrated ? 'Sẵn sàng' : 'Chưa hiệu chỉnh'}
                    tone={isCalibrated ? 'success' : 'neutral'}
                  />
                </div>

                {error && (
                  <div className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                    <RiErrorWarningLine className="h-5 w-5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                {sessionIssue && (
                  <div className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                    <RiErrorWarningLine className="h-5 w-5 shrink-0" />
                    <p>{sessionIssue}</p>
                  </div>
                )}

                {screenStale && isCalibrated && (
                  <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <RiErrorWarningLine className="h-5 w-5 shrink-0" />
                    <p>Màn hình đã đổi kích thước. Nên hiệu chỉnh lại để kết quả chính xác nhất.</p>
                  </div>
                )}

                <div className="mt-8 space-y-3">
                  <Button
                    size="lg"
                    onClick={handlePrimaryAction}
                    disabled={cameraState === 'checking' || faceState === 'checking'}
                    className="w-full rounded-full text-base"
                  >
                    {(cameraState === 'error' || faceState === 'not-found' || faceState === 'error') && <RiRefreshLine className="mr-2 h-5 w-5" />}
                    {readyToLearn && <RiEyeLine className="mr-2 h-5 w-5" />}
                    {primaryLabel}
                  </Button>

                  {isCalibrated && (
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => router.push(calibrationHref)}
                      className="w-full rounded-full text-primary border-primary/20 hover:bg-primary/5"
                    >
                      <RiRefreshLine className="mr-2 h-5 w-5" />
                      Hiệu chỉnh lại điểm nhìn
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
