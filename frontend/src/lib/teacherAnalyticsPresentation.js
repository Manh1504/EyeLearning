export function formatSeconds(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const seconds = Number(value);
  if (seconds < 60) return `${Math.round(seconds)} giây`;
  const minutes = Math.floor(seconds / 60);
  const remain = Math.round(seconds % 60);
  return `${minutes} phút ${remain} giây`;
}

export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${Math.round(Number(value) * 100)}%`;
}

export function summarizeLanding(coursePayloads) {
  const validPayloads = coursePayloads.filter(Boolean);
  const totalSessions = validPayloads.reduce((sum, item) => sum + (item.total_sessions || 0), 0);
  const studentsWithActivity = new Set(validPayloads.flatMap((item) => item.lessons?.map((lesson) => lesson.students_started > 0 ? lesson.lesson_id : null) || [])).size;
  const trackingPairs = validPayloads
    .flatMap((item) => item.lessons || [])
    .filter((lesson) => lesson.valid_tracking_rate !== null && lesson.valid_tracking_rate !== undefined);
  const validTrackingRate = trackingPairs.length
    ? trackingPairs.reduce((sum, lesson) => sum + Number(lesson.valid_tracking_rate || 0), 0) / trackingPairs.length
    : null;
  return {
    totalSessions,
    studentsWithActivity,
    validTrackingRate,
  };
}
