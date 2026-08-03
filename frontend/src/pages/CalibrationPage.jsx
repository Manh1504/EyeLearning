import { useEffect, useRef, useState } from "react";
import { apiUrl, loadClientConfig, requestJson } from "../lib/api.js";

const GRID_VALUES = [0.1, 0.5, 0.9];
const CHECKPOINT_NAME_ROWS = [
  ["top-left", "top-center", "top-right"],
  ["middle-left", "center", "middle-right"],
  ["bottom-left", "bottom-center", "bottom-right"],
];
const CALIBRATION_POINTS = GRID_VALUES.flatMap((y, rowIndex) =>
  GRID_VALUES.map((x, colIndex) => ({ x, y, name: CHECKPOINT_NAME_ROWS[rowIndex][colIndex] }))
);
const AI_HEALTH_TIMEOUT_MS = 2500;
const CALIBRATION_UPLOAD_TIMEOUT_MS = 120000;
const QUICK_VALIDATION_POINTS = [
  { x: 0.5, y: 0.5, name: "center" },
  { x: 0.32, y: 0.36, name: "upper-left-content" },
  { x: 0.68, y: 0.36, name: "upper-right-content" },
  { x: 0.36, y: 0.66, name: "lower-left-content" },
  { x: 0.64, y: 0.66, name: "lower-right-content" },
];

function sessionId() {
  return localStorage.getItem("session_id");
}

function environmentSnapshot(cameraLabel = "") {
  return {
    viewport_w: window.innerWidth,
    viewport_h: window.innerHeight,
    is_fullscreen: Boolean(document.fullscreenElement),
    device_pixel_ratio: window.devicePixelRatio || 1,
    camera_label: cameraLabel || null,
    orientation: window.innerWidth >= window.innerHeight ? "landscape" : "portrait",
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Dịch vụ eye-tracking phản hồi quá lâu. Kiểm tra AI container rồi thử lại.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function cameraErrorCopy(error) {
  const name = error?.name || "";
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      title: "Trình duyệt không hỗ trợ camera",
      detail: "Hãy dùng Chrome, Edge hoặc Safari phiên bản mới và mở ELA bằng HTTPS hoặc localhost.",
    };
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      title: "Bạn chưa cấp quyền camera",
      detail: "Mở phần cài đặt quyền của trình duyệt cho trang này, cho phép Camera rồi bấm Thử lại.",
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      title: "Không tìm thấy camera",
      detail: "Kiểm tra webcam đã kết nối và không bị tắt trong cài đặt hệ điều hành.",
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      title: "Camera đang được ứng dụng khác sử dụng",
      detail: "Đóng ứng dụng họp trực tuyến hoặc tab khác đang dùng camera, sau đó thử lại.",
    };
  }
  return {
    title: "Không thể mở camera",
    detail: error?.message || "Kiểm tra quyền camera và thiết bị rồi thử lại.",
  };
}

function profileStatusText(profile) {
  if (profile.artifact_status !== "available") return "Dữ liệu căn chỉnh không còn trên thiết bị/server này";
  if (profile.compatibility?.status === "compatible") return "Có thể sử dụng với thiết bị hiện tại";
  return "Không tương thích với môi trường hiện tại";
}

function compatibilityMessage(error) {
  const reasons = error?.detail?.reasons || [];
  if (!reasons.length) return error.message;
  const labels = {
    viewport_width: "chiều rộng cửa sổ học",
    viewport_height: "chiều cao cửa sổ học",
    device_pixel_ratio: "tỷ lệ hiển thị của màn hình",
    fullscreen_mode: "chế độ toàn màn hình",
    camera: "camera đang dùng",
    model_version: "phiên bản hồ sơ căn chỉnh",
    artifact_missing: "dữ liệu căn chỉnh đã lưu",
  };
  const readable = reasons.map((reason) => labels[reason] || reason).join(", ");
  return `Hồ sơ này được tạo trong điều kiện khác với hiện tại (${readable}). Để dữ liệu ánh nhìn chính xác, hãy chọn hồ sơ khác hoặc tạo hồ sơ căn chỉnh mới.`;
}

function markCalibrationReady(profileId) {
  localStorage.setItem("calibration_ready", "true");
  if (profileId) localStorage.setItem("calibration_profile_id", profileId);
  localStorage.setItem("calibration_viewport_w", String(window.innerWidth));
  localStorage.setItem("calibration_viewport_h", String(window.innerHeight));
  localStorage.setItem("calibration_is_fullscreen", String(Boolean(document.fullscreenElement)));
  localStorage.setItem("calibration_completed_at", String(Date.now()));
}

function validationTier(validationResult) {
  if (!validationResult) return "NONE";
  if (validationResult.status === "passed") return "PASS";
  if (validationResult.status === "retry") return "WARNING";
  if (validationResult.status === "failed") return "FAIL";
  return "NONE";
}

function derivePreflightAction({ cameraError, cameraStatus, profiles, selectedProfileId, validationResult }) {
  const tier = validationTier(validationResult);
  if (cameraError?.title?.includes("chưa cấp quyền")) {
    return { key: "camera", label: "Cho phép sử dụng camera", helper: "Trình duyệt đang chặn camera." };
  }
  if (cameraStatus === "Chưa kiểm tra") {
    return { key: "camera", label: "Kiểm tra camera", helper: "Bắt đầu bằng việc kiểm tra camera và tìm hồ sơ phù hợp." };
  }
  if (!profiles.length) {
    return { key: "calibration", label: "Tạo hồ sơ hiệu chỉnh", helper: "Quá trình này mất khoảng 1-2 phút." };
  }
  if (!selectedProfileId) {
    return { key: "select", label: "Chọn hồ sơ hiệu chỉnh", helper: "Chọn một hồ sơ để tiếp tục." };
  }
  if (!validationResult) {
    return { key: "validate", label: "Kiểm tra độ chính xác", helper: "Xác nhận hồ sơ hiện tại trước khi vào bài học." };
  }
  if (tier === "FAIL") {
    return { key: "retry-failed", label: "Kiểm tra lại", helper: "Kết quả hiện tại chưa đủ ổn định để bắt đầu bài học với theo dõi ánh nhìn." };
  }
  if (tier === "WARNING") {
    return { key: "retry-warning", label: "Kiểm tra lại độ chính xác", helper: "Việc kiểm tra lại chỉ mất khoảng 15 giây." };
  }
  return { key: "ready", label: "Bắt đầu bài học", helper: "Camera và hồ sơ hiệu chỉnh đã sẵn sàng cho bài học này." };
}

function buildStepStates({ cameraError, cameraStatus, profiles, selectedProfileId, validationResult, nextAction }) {
  const hasCamera = cameraStatus === "Đã cấp quyền";
  const hasProfile = Boolean(selectedProfileId) && profiles.length > 0;
  const tier = validationTier(validationResult);
  const step4State =
    tier === "PASS"
      ? "COMPLETED"
      : tier === "FAIL"
        ? "ERROR"
        : tier === "WARNING"
          ? "NEEDS_RECHECK"
          : nextAction.key === "validate"
            ? "ACTIVE"
            : hasProfile
              ? "PENDING"
              : "PENDING";

  return [
    {
      id: "camera",
      number: 1,
      label: "Quyền camera",
      state: cameraError ? "ERROR" : hasCamera ? "COMPLETED" : nextAction.key === "camera" ? "ACTIVE" : "PENDING",
      detail: cameraError ? "Cần cấp quyền camera" : hasCamera ? "Đã hoàn thành" : "Chưa kiểm tra",
    },
    {
      id: "signals",
      number: 2,
      label: "Vị trí và ánh sáng",
      state: cameraError ? "PENDING" : hasCamera ? "COMPLETED" : "PENDING",
      detail: hasCamera ? "Đã hoàn thành" : "Chờ kiểm tra camera",
    },
    {
      id: "profile",
      number: 3,
      label: "Hồ sơ hiệu chỉnh",
      state: hasProfile ? "COMPLETED" : nextAction.key === "calibration" || nextAction.key === "select" ? "ACTIVE" : "PENDING",
      detail: hasProfile ? "Đã hoàn thành" : profiles.length ? "Chọn hồ sơ" : "Chưa có hồ sơ phù hợp",
    },
    {
      id: "validation",
      number: 4,
      label: "Kiểm tra độ chính xác",
      state: step4State,
      detail:
        tier === "PASS"
          ? "Đã hoàn thành"
          : tier === "WARNING"
            ? "Độ chính xác cần cải thiện"
            : tier === "FAIL"
              ? "Kiểm tra độ chính xác chưa đạt"
              : hasProfile
                ? "Chưa thực hiện"
                : "Chờ hồ sơ hiệu chỉnh",
    },
    {
      id: "ready",
      number: 5,
      label: "Sẵn sàng",
      state: nextAction.key === "ready" || nextAction.key === "retry-warning" ? "ACTIVE" : "PENDING",
      detail:
        nextAction.key === "ready"
          ? "Sẵn sàng bắt đầu"
          : nextAction.key === "retry-warning"
            ? "Có thể bắt đầu"
            : "Chờ hoàn tất các bước trước",
    },
  ];
}

function stepIcon(step) {
  if (step.state === "COMPLETED") return "✓";
  if (step.state === "ERROR") return "×";
  if (step.state === "NEEDS_RECHECK") return "!";
  if (step.id === "ready" && step.state === "PENDING") return "○";
  if (step.state === "ACTIVE") return "●";
  return String(step.number);
}

function previewState(cameraStatus, cameraError, previewActive) {
  if (previewActive) return "active";
  if (cameraStatus === "Đang kiểm tra thiết bị") return "loading";
  if (cameraError?.title?.includes("Không tìm thấy camera")) return "missing";
  if (cameraError) return "denied";
  return "idle";
}

function currentPreflightPhase({ cameraStatus, cameraError, profiles, selectedProfileId, validationResult }) {
  const tier = validationTier(validationResult);
  if (cameraStatus === "Chưa kiểm tra" || cameraStatus === "Đang kiểm tra thiết bị" || cameraError) return "camera";
  if (!profiles.length || !selectedProfileId) return "profile";
  if (tier === "NONE") return "validation";
  return "ready";
}

export default function CalibrationPage() {
  const currentSession = sessionId();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const dotRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const clientConfigRef = useRef(null);
  const activeRef = useRef(false);
  const currentIndexRef = useRef(0);
  const capturedPointsRef = useRef([]);
  const capturedFramesRef = useRef([]);
  const activePointsRef = useRef(CALIBRATION_POINTS);
  const captureModeRef = useRef("calibration");
  const lockedSizeRef = useRef({ width: 0, height: 0 });
  const submittingRef = useRef(false);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [status, setStatusState] = useState({ message: "", kind: "" });
  const [aiStatus, setAiStatusState] = useState({ message: "Đang kiểm tra", ok: false });
  const [progress, setProgress] = useState(`Điểm 1 / ${CALIBRATION_POINTS.length}`);
  const [cameraStatus, setCameraStatus] = useState("Chưa kiểm tra");
  const [cameraError, setCameraError] = useState(null);
  const [captureDisabled, setCaptureDisabled] = useState(false);
  const [dotPos, setDotPos] = useState({ left: 0, top: 0 });
  const [preflightState, setPreflightState] = useState("IDLE");
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileName, setProfileName] = useState("Laptop ở nhà");
  const [validationResult, setValidationResult] = useState(null);
  const [previewActive, setPreviewActive] = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [showCreateProfileForm, setShowCreateProfileForm] = useState(false);
  const [setupSignals, setSetupSignals] = useState({
    framing: "Chưa kiểm tra",
    lighting: "Chưa kiểm tra",
    distance: "Giữ cách màn hình khoảng một cánh tay",
    stability: "Chưa kiểm tra",
  });

  const setStatus = (message, kind = "") => setStatusState({ message, kind });
  const setAiStatus = (message, ok = false) => setAiStatusState({ message, ok });

  async function loadConfig() {
    const config = await loadClientConfig(true);
    clientConfigRef.current = config;
    return config;
  }

  async function checkAi() {
    let savedProfile = null;
    try {
      const config = clientConfigRef.current || (await loadConfig());
      const response = await fetchWithTimeout(`${config.ai_http_url}/health_check`, {}, AI_HEALTH_TIMEOUT_MS);
      setAiStatus(response.ok ? "Sẵn sàng" : "Chưa kết nối", response.ok);
      return response.ok;
    } catch (error) {
      setAiStatus("Chưa kết nối", false);
      setStatus(
        `${error.message || "Dịch vụ eye-tracking chưa kết nối."} URL: ${clientConfigRef.current?.ai_http_url || "unknown"}`,
        "error"
      );
      return false;
    }
  }

  function positionDot() {
    const points = activePointsRef.current;
    const point = points[currentIndexRef.current];
    setDotPos({ left: point.x * window.innerWidth, top: point.y * window.innerHeight });
    setProgress(`Điểm ${currentIndexRef.current + 1} / ${points.length}`);
  }

  async function startCamera() {
    setCameraStatus("Đang kiểm tra thiết bị");
    setCameraError(null);
    try {
      if (!videoRef.current) {
        throw new Error("Camera element chưa sẵn sàng. Hãy tải lại trang rồi thử lại.");
      }
      if (mediaStreamRef.current) {
        const activeTrack = mediaStreamRef.current.getVideoTracks()[0];
        setPreviewActive(true);
        setCameraStatus("Đã cấp quyền");
        return activeTrack?.label || "";
      }
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      videoRef.current.srcObject = mediaStreamRef.current;
      await videoRef.current.play();
      const track = mediaStreamRef.current.getVideoTracks()[0];
      setPreviewActive(true);
      setSetupSignals({
        framing: "Căn giữa khuôn mặt trong khung xem trước",
        lighting: "Đủ sáng nếu khuôn mặt không bị tối hoặc ngược sáng",
        distance: "Giữ khoảng 40-70 cm với màn hình",
        stability: "Giữ đầu và cửa sổ ổn định trong lúc kiểm tra",
      });
      setCameraStatus("Đã cấp quyền");
      return track?.label || "";
    } catch (error) {
      const copy = cameraErrorCopy(error);
      setCameraStatus(copy.title);
      setCameraError(copy);
      throw new Error(`${copy.title}. ${copy.detail}`);
    }
  }

  function stopCamera() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewActive(false);
  }

  function resetCollection() {
    currentIndexRef.current = 0;
    capturedPointsRef.current = [];
    capturedFramesRef.current = [];
  }

  async function loadProfiles(cameraLabel = "") {
    setPreflightState("FINDING_PROFILE");
    setShowCreateProfileForm(false);
    const env = environmentSnapshot(cameraLabel);
    const params = new URLSearchParams({
      viewport_w: String(env.viewport_w),
      viewport_h: String(env.viewport_h),
      is_fullscreen: String(env.is_fullscreen),
      device_pixel_ratio: String(env.device_pixel_ratio),
      orientation: env.orientation,
    });
    if (env.camera_label) params.set("camera_label", env.camera_label);
    const list = await requestJson(apiUrl(`/calibration-profiles?${params.toString()}`));
    setProfiles(list);
    const recommended =
      list.find((profile) => profile.artifact_status === "available" && profile.compatibility?.status === "compatible" && profile.last_validation_status === "passed") ||
      list.find((profile) => profile.artifact_status === "available" && profile.compatibility?.status === "compatible") ||
      "";
    setSelectedProfileId(recommended?.id || list[0]?.id || "");
    setPreflightState(list.length ? "SELECTING_PROFILE" : "NO_PROFILE");
    return list;
  }

  function cancelCalibration(message = "Đã dừng hiệu chỉnh.") {
    activeRef.current = false;
    resetCollection();
    stopCamera();
    setOverlayVisible(false);
    setStatus(message, message.includes("kích thước") ? "error" : "");
  }

  useEffect(() => {
    function guardViewport() {
      if (!activeRef.current) return;
      if (window.innerWidth !== lockedSizeRef.current.width || window.innerHeight !== lockedSizeRef.current.height) {
        cancelCalibration("Kích thước cửa sổ đã thay đổi. Hãy hiệu chỉnh lại để dữ liệu gaze khớp màn hình.");
      }
    }
    window.addEventListener("resize", guardViewport);
    return () => window.removeEventListener("resize", guardViewport);
  }, []);

  async function captureFrameBlob() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(video, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  }

  async function submitCalibration() {
    activeRef.current = false;
    submittingRef.current = true;
    setProgress("Đang xử lý hiệu chỉnh...");
    setStatus("Đang gửi dữ liệu hiệu chỉnh tới dịch vụ eye-tracking...");

    const formData = new FormData();
    formData.append("session_id", sessionId());
    formData.append("points", JSON.stringify(capturedPointsRef.current));
    formData.append("viewport_w", String(window.innerWidth));
    formData.append("viewport_h", String(window.innerHeight));
    capturedFramesRef.current.forEach((blob, index) => {
      formData.append("frames", blob, `calibration_${index + 1}.jpg`);
    });

    const response = await fetchWithTimeout(
      `${clientConfigRef.current.ai_http_url}/calibrate`,
      { method: "POST", body: formData },
      CALIBRATION_UPLOAD_TIMEOUT_MS
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      localStorage.removeItem("calibration_ready");
      throw new Error(result.error || `Hiệu chỉnh thất bại với HTTP ${response.status}.`);
    }

    // Persist calibration xuống Web Service DB — trước đây bước này hoàn
    // toàn thiếu, model chỉ sống trong RAM AI Service (mất khi restart).
    try {
      const persistResponse = await fetch(apiUrl("/calibration"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId(),
          profile_name: profileName.trim() || "Hồ sơ căn chỉnh",
          viewport_w: window.innerWidth,
          viewport_h: window.innerHeight,
          is_fullscreen: Boolean(document.fullscreenElement),
          device_pixel_ratio: window.devicePixelRatio || 1,
          camera_label: mediaStreamRef.current?.getVideoTracks()[0]?.label || null,
          orientation: window.innerWidth >= window.innerHeight ? "landscape" : "portrait",
          avg_error_px: result.avg_error_px ?? null,
          model_x_b64: result.model_x_b64,
          model_y_b64: result.model_y_b64,
          model_format: result.model_format || "joblib",
          checkpoints: result.per_point || [],
        }),
      });
      if (!persistResponse.ok) {
        const errText = await persistResponse.text().catch(() => "");
        // Không chặn luồng học nếu persist DB lỗi — AI Service vẫn có model
        // trong RAM để predict, chỉ là mất bản backup DB lần này.
        throw new Error(errText || `HTTP ${persistResponse.status}`);
      }
      savedProfile = await persistResponse.json();
      setSelectedProfileId(savedProfile.calibration_group_id);
    } catch (persistError) {
      throw new Error(`Không thể lưu hồ sơ căn chỉnh: ${persistError.message}`);
    }

    stopCamera();
    submittingRef.current = false;
    setOverlayVisible(false);
    markCalibrationReady(savedProfile.calibration_group_id);
    setPreflightState("READY_TO_LEARN");
    setStatus(`Đã lưu hồ sơ "${profileName}". Bạn có thể bắt đầu học.`, "ok");
    await loadProfiles();
  }

  async function submitQuickValidation() {
    activeRef.current = false;
    submittingRef.current = true;
    setPreflightState("QUICK_VALIDATION");
    setProgress("Đang đánh giá độ chính xác...");
    setStatus("Đang kiểm tra độ chính xác của hồ sơ hiện tại...");

    const formData = new FormData();
    formData.append("session_id", sessionId());
    formData.append("points", JSON.stringify(capturedPointsRef.current));
    formData.append("viewport_w", String(window.innerWidth));
    formData.append("viewport_h", String(window.innerHeight));
    capturedFramesRef.current.forEach((blob, index) => {
      formData.append("frames", blob, `validation_${index + 1}.jpg`);
    });

    const response = await fetchWithTimeout(
      `${clientConfigRef.current.ai_http_url}/calibration/validate`,
      { method: "POST", body: formData },
      CALIBRATION_UPLOAD_TIMEOUT_MS
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      throw new Error(result.error || `Kiểm tra nhanh thất bại với HTTP ${response.status}.`);
    }

    const selected = selectedProfileId;
    const validation = await requestJson(apiUrl(`/calibration-profiles/${encodeURIComponent(selected)}/validation-runs`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId(),
        environment: environmentSnapshot(mediaStreamRef.current?.getVideoTracks()[0]?.label || ""),
        metrics: result.metrics,
        predictions: result.predictions,
      }),
    });

    setValidationResult({ ...validation, predictions: result.predictions });
    stopCamera();
    submittingRef.current = false;
    setOverlayVisible(false);
    markCalibrationReady(selected);
    setPreflightState("READY_TO_LEARN");
    if (validation.status === "passed") {
      setStatus("Kết quả kiểm tra độ chính xác đạt yêu cầu.", "ok");
      return;
    }
    if (validation.status === "retry") {
      setStatus("Độ chính xác chưa tối ưu. Bạn có thể kiểm tra lại hoặc tiếp tục học.", "warning");
      return;
    }
    setStatus("Kết quả hiện tại chưa đủ ổn định. Hãy kiểm tra lại hoặc tạo hồ sơ hiệu chỉnh mới.", "error");
  }

  async function captureCurrentPoint() {
    if (!activeRef.current) return;
    setCaptureDisabled(true);
    try {
      const points = activePointsRef.current;
      const target = points[currentIndexRef.current];
      const blob = await captureFrameBlob();
      if (!blob) throw new Error("Không chụp được khung hình từ webcam. Hãy thử lại.");
      capturedPointsRef.current.push({ x: target.x, y: target.y, name: target.name });
      capturedFramesRef.current.push(blob);
      currentIndexRef.current += 1;

      if (currentIndexRef.current >= points.length) {
        if (captureModeRef.current === "validation") {
          await submitQuickValidation();
        } else {
          await submitCalibration();
        }
        return;
      }
      positionDot();
    } catch (error) {
      if (submittingRef.current || !activeRef.current) {
        submittingRef.current = false;
        stopCamera();
        setOverlayVisible(false);
        setProgress(`Điểm ${activePointsRef.current.length} / ${activePointsRef.current.length}`);
      }
      setStatus(error.message, "error");
    } finally {
      setCaptureDisabled(false);
    }
  }

  async function startCalibration() {
    if (!sessionId()) {
      setStatus("Hãy chọn bài học để tạo phiên trước khi hiệu chỉnh.", "error");
      return;
    }

    try {
      await loadConfig();
      const aiOk = await checkAi();
      if (!aiOk) return;
      captureModeRef.current = "calibration";
      activePointsRef.current = CALIBRATION_POINTS;
      setPreflightState("FULL_CALIBRATION");
      setStatus("Đang bắt đầu căn chỉnh mới. Giữ nguyên kích thước cửa sổ trong suốt quá trình.", "ok");
      lockedSizeRef.current = { width: window.innerWidth, height: window.innerHeight };
      resetCollection();
      stopCamera();
      setOverlayVisible(true);
      activeRef.current = true;
      await startCamera();
      positionDot();
    } catch (error) {
      activeRef.current = false;
      stopCamera();
      setOverlayVisible(false);
      setStatus(error.message, "error");
    }
  }

  async function startPreflightCheck() {
    try {
      setPreflightState("CHECKING_CAMERA");
      setValidationResult(null);
      setShowProfilePicker(false);
      setShowCreateProfileForm(false);
      await loadConfig();
      const aiOk = await checkAi();
      if (!aiOk) return;
      const cameraLabel = await startCamera();
      await loadProfiles(cameraLabel);
      setStatus("Camera đã sẵn sàng. Bạn có thể chọn hồ sơ phù hợp để tiếp tục.", "ok");
    } catch (error) {
      stopCamera();
      setPreflightState("IDLE");
      setStatus(error.message, "error");
    }
  }

  async function startQuickValidation() {
    if (!selectedProfileId) {
      setStatus("Hãy chọn hồ sơ căn chỉnh trước.", "error");
      return;
    }
    try {
      await loadConfig();
      const aiOk = await checkAi();
      if (!aiOk) return;
      const cameraLabel = await startCamera();
      setPreflightState("LOADING_PROFILE");
      await requestJson(apiUrl(`/calibration-profiles/${encodeURIComponent(selectedProfileId)}/load`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId(), environment: environmentSnapshot(cameraLabel) }),
      });
      captureModeRef.current = "validation";
      activePointsRef.current = QUICK_VALIDATION_POINTS;
      lockedSizeRef.current = { width: window.innerWidth, height: window.innerHeight };
      resetCollection();
      setOverlayVisible(true);
      activeRef.current = true;
      setStatus("Hồ sơ đã được áp dụng. Bắt đầu kiểm tra độ chính xác.", "ok");
      positionDot();
    } catch (error) {
      activeRef.current = false;
      stopCamera();
      setOverlayVisible(false);
      setPreflightState("PROFILE_INCOMPATIBLE");
      setStatus(compatibilityMessage(error), "error");
    }
  }

  async function startLearningWithProfile() {
    if (!selectedProfileId) {
      setStatus("Hãy chọn hồ sơ căn chỉnh trước.", "error");
      return;
    }
    try {
      await loadConfig();
      const aiOk = await checkAi();
      if (!aiOk) return;
      const cameraLabel = await startCamera();
      setPreflightState("LOADING_PROFILE");
      const result = await requestJson(apiUrl(`/calibration-profiles/${encodeURIComponent(selectedProfileId)}/load`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId(), environment: environmentSnapshot(cameraLabel) }),
      });
      markCalibrationReady(selectedProfileId);
      setPreflightState("READY_TO_LEARN");
      if (result.compatibility_warning) {
        setStatus("Hồ sơ đã được áp dụng. Môi trường hiện tại có khác biệt nhẹ so với lần căn chỉnh trước.", "warning");
      } else {
        setStatus("Hồ sơ đã sẵn sàng. Đang vào bài học.", "ok");
      }
      window.location.href = "/lesson";
    } catch (error) {
      stopCamera();
      setPreflightState("PROFILE_INCOMPATIBLE");
      setStatus(compatibilityMessage(error), "error");
    }
  }

  useEffect(() => {
    function onKeydown(event) {
      if (event.code === "Space" && activeRef.current) {
        event.preventDefault();
        captureCurrentPoint();
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadConfig()
      .then(checkAi)
      .catch(() => setAiStatus("Chưa kết nối", false));
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isTechnicalUser =
    localStorage.getItem("role") === "admin" ||
    new URLSearchParams(window.location.search).get("debug") === "1";
  const nextAction = derivePreflightAction({ cameraError, cameraStatus, profiles, selectedProfileId, validationResult });
  const steps = buildStepStates({ cameraError, cameraStatus, profiles, selectedProfileId, validationResult, nextAction });
  const activeStep = steps.find((step) => step.state === "ACTIVE") || steps[0];
  const validationState = validationTier(validationResult);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) || null;
  const phase = currentPreflightPhase({ cameraStatus, cameraError, profiles, selectedProfileId, validationResult });
  const previewMode = previewState(cameraStatus, cameraError, previewActive);
  const checklistItems = [
    { label: "Khuôn mặt trong khung", value: setupSignals.framing, state: previewActive ? "completed" : "pending" },
    { label: "Ánh sáng phù hợp", value: setupSignals.lighting, state: previewActive ? "completed" : "pending" },
    { label: "Khoảng cách phù hợp", value: setupSignals.distance, state: previewActive ? "completed" : "pending" },
    { label: "Hình ảnh ổn định", value: setupSignals.stability, state: previewActive ? "completed" : "pending" },
  ];
  const shouldHideStatusLine =
    Boolean(validationResult) &&
    !cameraError &&
    (status.message.includes("Kiểm tra nhanh") ||
      status.message.includes("Kết quả kiểm tra độ chính xác đạt yêu cầu") ||
      status.message.includes("Độ chính xác chưa tối ưu") ||
      status.message.includes("Kết quả hiện tại chưa đủ ổn định") ||
      status.message.includes("Hồ sơ đã được áp dụng") ||
      status.message.includes("Hồ sơ đã sẵn sàng. Đang vào bài học."));
  const showStatusLine = Boolean(status.message) && !shouldHideStatusLine;
  const detailMetrics = validationResult
    ? [
        `Số điểm hợp lệ: ${validationResult.metrics?.valid_sample_count ?? 0}/${validationResult.metrics?.sample_count ?? 0}`,
        `Sai số trung vị: ${
          validationResult.metrics?.median_error_norm == null
            ? "-"
            : `${Math.round(validationResult.metrics.median_error_norm * 100)}% kích thước đường chéo màn hình`
        }`,
      ]
    : [];
  if (validationResult?.thresholds?.median_error_norm != null) {
    detailMetrics.push(`Mức khuyến nghị: dưới ${Math.round(validationResult.thresholds.median_error_norm * 100)}%`);
  }

  function runPrimaryAction() {
    if (nextAction.key === "camera") return startPreflightCheck();
    if (nextAction.key === "calibration") {
      if (!showCreateProfileForm) {
        setShowCreateProfileForm(true);
        return;
      }
      return startCalibration();
    }
    if (nextAction.key === "validate" || nextAction.key === "retry-warning" || nextAction.key === "retry-failed") return startQuickValidation();
    if (nextAction.key === "ready") return startLearningWithProfile();
    setStatus(nextAction.helper, "error");
  }

  function runSecondaryAction() {
    if (nextAction.key === "retry-warning") return startLearningWithProfile();
    if (nextAction.key === "retry-failed") return startCalibration();
    return null;
  }

  function activeStepTitle() {
    if (validationState === "PASS") return "Sẵn sàng bắt đầu";
    if (validationState === "WARNING") return "Độ chính xác chưa tối ưu";
    if (validationState === "FAIL") return "Cần kiểm tra lại độ chính xác";
    if (activeStep.id === "camera") return "Kiểm tra camera";
    if (activeStep.id === "signals") return "Vị trí và ánh sáng";
    if (activeStep.id === "profile") return selectedProfile ? "Hồ sơ đang sử dụng" : "Chọn hồ sơ hiệu chỉnh";
    if (activeStep.id === "validation") return "Kiểm tra độ chính xác";
    return "Sẵn sàng bắt đầu";
  }

  function activeStepDescription() {
    if (validationState === "PASS") return "Camera và hồ sơ hiệu chỉnh đã sẵn sàng cho bài học này.";
    if (validationState === "WARNING") return "Hệ thống vẫn có thể ghi nhận ánh nhìn, nhưng kết quả có thể kém chính xác hơn. Bạn nên kiểm tra lại trước khi bắt đầu bài học.";
    if (validationState === "FAIL") return "Kết quả hiện tại chưa đủ ổn định để theo dõi ánh nhìn trong bài học. Hãy kiểm tra lại hoặc tạo hồ sơ hiệu chỉnh mới.";
    if (activeStep.id === "camera") return "Cho phép ELA truy cập camera để kiểm tra thiết bị và tìm hồ sơ phù hợp.";
    if (activeStep.id === "signals") return "Giữ khuôn mặt ở giữa khung hình, ánh sáng đều và khoảng cách ổn định với màn hình.";
    if (activeStep.id === "profile") return selectedProfile ? "ELA sẽ dùng hồ sơ phù hợp nhất với thiết bị hiện tại." : "Thiết bị này chưa có hồ sơ phù hợp hoặc bạn cần đổi sang hồ sơ khác.";
    if (activeStep.id === "validation") return "Nhìn lần lượt vào các điểm xuất hiện trên màn hình. Quá trình mất khoảng 15 giây.";
    return "Hồ sơ hiệu chỉnh đã phù hợp với thiết bị và điều kiện hiện tại.";
  }

  function previewCopy() {
    if (previewMode === "loading") {
      return {
        title: "Đang mở camera...",
        detail: "ELA đang kiểm tra thiết bị và xin quyền truy cập camera.",
      };
    }
    if (previewMode === "denied") {
      return {
        title: "Chưa thể truy cập camera",
        detail: "Cho phép camera trong trình duyệt để tiếp tục.",
      };
    }
    if (previewMode === "missing") {
      return {
        title: "Không tìm thấy camera",
        detail: "Kiểm tra webcam trên thiết bị rồi thử lại.",
      };
    }
    return {
      title: "Khung xem trước camera",
      detail: "Camera sẽ hiển thị tại đây khi bạn bắt đầu kiểm tra.",
    };
  }

  const previewText = previewCopy();

  return (
    <main className="layout-shell calibration-page">
      <section className="panel calibration-card" hidden={overlayVisible}>
        <div className="preflight-layout">
          <div className="preflight-preview-panel">
            <div>
              <div className="course-kicker">Chuẩn bị học</div>
              <h1>Chuẩn bị theo dõi ánh nhìn</h1>
              <p className="muted">Kiểm tra camera và hồ sơ hiệu chỉnh trước khi bắt đầu bài học.</p>
              <p className="muted">Camera được dùng để ước lượng điểm nhìn. Video webcam không hiển thị cho giảng viên.</p>
            </div>
            <div className={`camera-preview-frame ${previewActive ? "active" : ""} preview-${previewMode}`}>
              <video ref={videoRef} autoPlay playsInline muted className={previewActive ? "is-visible" : ""} />
              {!previewActive && (
                <div className="camera-preview-empty">
                  <strong>{previewText.title}</strong>
                  <span>{previewText.detail}</span>
                </div>
              )}
            </div>
            <div className="camera-signal-list compact-checklist">
              {checklistItems.map((item) => (
                <span key={item.label} className={`signal-row state-${item.state}`}>
                  <i aria-hidden="true">{item.state === "completed" ? "✓" : item.state === "error" ? "!" : "○"}</i>
                  <strong>{item.label}</strong>
                  <em>{item.value}</em>
                </span>
              ))}
            </div>
          </div>
          <div className="preflight-steps-panel">
            <div className="compact-stepper" aria-label="Các bước chuẩn bị">
              {steps.map((step) => (
                <div className={`stepper-row state-${step.state.toLowerCase()}`} key={step.id}>
                  <span className="stepper-icon" aria-hidden="true">{stepIcon(step)}</span>
                  <div className="stepper-copy">
                    <strong>{step.label}</strong>
                    <span>{step.detail}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="active-step-panel">
              <div>
                <h2>{activeStepTitle()}</h2>
                <p className="muted">{activeStepDescription()}</p>
              </div>

              {phase === "profile" && selectedProfile && (
                <section className="profile-summary-card">
                  <div>
                    <h3>Hồ sơ đang sử dụng</h3>
                    <strong>{selectedProfile.profile_name}</strong>
                    <span>{profileStatusText(selectedProfile)}</span>
                    <small>
                      Kiểm tra gần nhất: {selectedProfile.last_validation_at
                        ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(selectedProfile.last_validation_at))
                        : "Chưa có"}
                    </small>
                  </div>
                  <button className="btn secondary" type="button" onClick={() => setShowProfilePicker((value) => !value)}>
                    {showProfilePicker ? "Ẩn danh sách hồ sơ" : "Đổi hồ sơ"}
                  </button>
                </section>
              )}

              {phase === "profile" && showProfilePicker && profiles.length > 0 && (
                <section className="profile-picker-panel">
                  <div className="section-header">
                    <div>
                      <h3>Chọn hồ sơ khác</h3>
                      <p className="muted">Chỉ hiển thị những hồ sơ tương thích với thiết bị hiện tại.</p>
                    </div>
                  </div>
                  <div className="profile-list" role="radiogroup" aria-label="Chọn hồ sơ căn chỉnh">
                    {profiles.map((profile) => (
                      <label className={`profile-option ${selectedProfileId === profile.id ? "selected" : ""}`} key={profile.id}>
                        <input
                          type="radio"
                          name="calibrationProfile"
                          value={profile.id}
                          checked={selectedProfileId === profile.id}
                          onChange={() => setSelectedProfileId(profile.id)}
                        />
                        <span>
                          <strong>{profile.profile_name}</strong>
                          <em>{profileStatusText(profile)}</em>
                          <small>Kiểm tra gần nhất: {profile.last_validation_at ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(profile.last_validation_at)) : "Chưa có"}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {phase === "profile" && !selectedProfile && profiles.length > 0 && (
                <section className="profile-picker-panel">
                  <h3>Chọn hồ sơ hiệu chỉnh</h3>
                  <div className="profile-list" role="radiogroup" aria-label="Chọn hồ sơ căn chỉnh">
                    {profiles.map((profile) => (
                      <label className={`profile-option ${selectedProfileId === profile.id ? "selected" : ""}`} key={profile.id}>
                        <input
                          type="radio"
                          name="calibrationProfile"
                          value={profile.id}
                          checked={selectedProfileId === profile.id}
                          onChange={() => setSelectedProfileId(profile.id)}
                        />
                        <span>
                          <strong>{profile.profile_name}</strong>
                          <em>{profileStatusText(profile)}</em>
                          <small>Kiểm tra gần nhất: {profile.last_validation_at ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(profile.last_validation_at)) : "Chưa có"}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {phase === "profile" && !profiles.length && (
                <section className="profile-picker-panel">
                  <h3>Chưa có hồ sơ phù hợp</h3>
                  <p className="muted">Tạo một hồ sơ hiệu chỉnh cho thiết bị này. Quá trình mất khoảng 1-2 phút.</p>
                  {showCreateProfileForm && (
                    <div className="field compact-field">
                      <label htmlFor="profileName">Tên hồ sơ</label>
                      <input id="profileName" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
                    </div>
                  )}
                </section>
              )}

              {phase === "validation" && selectedProfile && (
                <section className="profile-summary-card validation-ready-card">
                  <div>
                    <h3>Hồ sơ đang sử dụng</h3>
                    <strong>{selectedProfile.profile_name}</strong>
                    <span>{profileStatusText(selectedProfile)}</span>
                  </div>
                  <button className="btn text" type="button" onClick={() => setShowProfilePicker((value) => !value)}>
                    Đổi hồ sơ
                  </button>
                </section>
              )}

              {phase === "ready" && validationResult && (
                <div className={`validation-panel validation-${validationState.toLowerCase()}`}>
                  {validationState === "PASS" && <small>Kết quả kiểm tra độ chính xác đạt yêu cầu.</small>}
                  {validationState === "WARNING" && <small>Việc kiểm tra lại chỉ mất khoảng 15 giây.</small>}
                  <details>
                    <summary>Xem chi tiết kết quả kiểm tra</summary>
                    <div className="validation-details">
                      {detailMetrics.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  </details>
                </div>
              )}

              <div className={`preflight-primary-action ${validationState === "WARNING" ? "is-warning" : ""}`.trim()}>
                <button className="btn primary" type="button" onClick={runPrimaryAction}>
                  {nextAction.key === "calibration" && showCreateProfileForm ? "Bắt đầu căn chỉnh" : nextAction.label}
                </button>
                {(nextAction.key === "retry-warning" || nextAction.key === "retry-failed") && (
                  <button className="btn secondary" type="button" onClick={runSecondaryAction}>
                    {nextAction.key === "retry-warning" ? "Vẫn tiếp tục học" : "Căn chỉnh lại"}
                  </button>
                )}
                {phase === "profile" && selectedProfile && !showProfilePicker && (
                  <button className="btn text" type="button" onClick={() => setShowProfilePicker(true)}>
                    Đổi hồ sơ
                  </button>
                )}
                {(phase === "camera" || phase === "profile") && currentSession && (
                  <a className="btn text" href="/courses">Quay lại khóa học</a>
                )}
                <span>{nextAction.helper}</span>
              </div>
            </div>
          </div>
        </div>
        {isTechnicalUser && (
          <div className="qa-strip">
            <span>Phiên <strong>{currentSession || "Chưa có"}</strong></span>
            <span>Dịch vụ <strong className={aiStatus.ok ? "ok-text" : ""}>{aiStatus.message}</strong></span>
            <span>Camera <strong>{cameraStatus}</strong></span>
            <span>Trạng thái <strong>{preflightState}</strong></span>
          </div>
        )}
        {cameraError && phase === "camera" && (
          <div className="inline-alert error" role="alert">
            <strong>{cameraError.title}</strong>
            <span>{cameraError.detail}</span>
          </div>
        )}
        {showStatusLine && <div className={`status-line ${status.kind}`.trim()}>{status.message}</div>}
      </section>

      {overlayVisible && (
        <section className="calibration-overlay">
          <div className="calibration-topbar">
            <span>{progress}</span>
            <span>{cameraStatus}</span>
            <button className="btn danger" type="button" onClick={() => cancelCalibration()}>Dừng</button>
          </div>
          <div className="calibration-instruction">
            {captureModeRef.current === "validation" ? "Nhìn vào điểm để kiểm tra nhanh, sau đó bấm Space" : "Nhìn vào điểm, sau đó bấm Space"}
          </div>
          <button
            className="calibration-capture-btn"
            type="button"
            disabled={captureDisabled}
            onClick={captureCurrentPoint}
          >
            {captureDisabled ? "Đang ghi nhận" : "Ghi nhận"}
          </button>
          <div
            ref={dotRef}
            className="calibration-dot"
            style={{ left: `${dotPos.left}px`, top: `${dotPos.top}px` }}
          ></div>
        </section>
      )}
      <canvas ref={canvasRef} hidden></canvas>
    </main>
  );
}
