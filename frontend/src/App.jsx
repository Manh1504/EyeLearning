import { Routes, Route } from "react-router-dom";
import { Navigate } from "react-router-dom";
import StartPage from "./pages/StartPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import CoursesPage from "./pages/CoursesPage.jsx";
import CourseDetailPage from "./pages/CourseDetailPage.jsx";
import LessonPage from "./pages/LessonPage.jsx";
import CalibrationPage from "./pages/CalibrationPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import TeacherDashboardPage from "./pages/TeacherDashboardPage.jsx";
import TeacherCoursesPage from "./pages/TeacherCoursesPage.jsx";
import TeacherCourseDetailPage from "./pages/TeacherCourseDetailPage.jsx";
import TeacherClassesPage from "./pages/TeacherClassesPage.jsx";
import TeacherAnalyticsHubPage from "./pages/TeacherAnalyticsHubPage.jsx";
import TeacherLessonAnalyticsPage from "./pages/TeacherLessonAnalyticsPage.jsx";
import AdminOverviewPage, {
  AdminAnalyticsPage,
  AdminEyeTrackingReportPage,
  AdminEyeTrackingTestPage,
  AdminSessionDetailPage,
  AdminSessionsPage,
  AdminSystemPage,
  AdminUsersPage,
} from "./pages/AdminPage.jsx";
import { RequireRole, RequireSession } from "./components/RouteGuards.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StartPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/courses" element={<RequireRole allow={["student"]}><CoursesPage /></RequireRole>} />
      <Route path="/courses/:courseId" element={<RequireRole allow={["student"]}><CourseDetailPage /></RequireRole>} />
      <Route path="/lesson" element={<RequireRole allow={["student", "admin"]}><RequireSession><LessonPage /></RequireSession></RequireRole>} />
      <Route path="/calibration" element={<RequireRole allow={["student", "admin"]}><RequireSession><CalibrationPage /></RequireSession></RequireRole>} />
      <Route path="/camera-check" element={<RequireRole allow={["student", "admin"]}><RequireSession><CalibrationPage /></RequireSession></RequireRole>} />
      <Route path="/calibration-profiles" element={<RequireRole allow={["student", "admin"]}><CalibrationPage mode="account" /></RequireRole>} />
      <Route path="/analytics" element={<RequireRole allow={["teacher", "admin"]}><AnalyticsPage /></RequireRole>} />
      <Route path="/teacher" element={<RequireRole allow={["teacher", "admin"]}><TeacherDashboardPage /></RequireRole>} />
      <Route path="/teacher/courses" element={<RequireRole allow={["teacher", "admin"]}><TeacherCoursesPage /></RequireRole>} />
      <Route path="/teacher/courses/:courseId" element={<RequireRole allow={["teacher", "admin"]}><TeacherCourseDetailPage /></RequireRole>} />
      <Route path="/teacher/courses/:courseId/lessons/:lessonId/analytics" element={<RequireRole allow={["teacher", "admin"]}><TeacherLessonAnalyticsPage /></RequireRole>} />
      <Route path="/teacher/classes" element={<RequireRole allow={["teacher", "admin"]}><Navigate to="/teacher" replace /></RequireRole>} />
      <Route path="/teacher/analytics" element={<RequireRole allow={["teacher", "admin"]}><TeacherAnalyticsHubPage /></RequireRole>} />
      <Route path="/admin" element={<RequireRole allow={["admin"]}><Navigate to="/admin/overview" replace /></RequireRole>} />
      <Route path="/admin/overview" element={<RequireRole allow={["admin"]}><AdminOverviewPage /></RequireRole>} />
      <Route path="/admin/sessions" element={<RequireRole allow={["admin"]}><AdminSessionsPage /></RequireRole>} />
      <Route path="/admin/sessions/:sessionId" element={<RequireRole allow={["admin"]}><AdminSessionDetailPage /></RequireRole>} />
      <Route path="/admin/analytics" element={<RequireRole allow={["admin"]}><AdminAnalyticsPage /></RequireRole>} />
      <Route path="/admin/courses/:courseId/analytics" element={<RequireRole allow={["admin"]}><AdminAnalyticsPage /></RequireRole>} />
      <Route path="/admin/courses/:courseId/lessons/:lessonId/analytics" element={<RequireRole allow={["admin"]}><AdminAnalyticsPage /></RequireRole>} />
      <Route path="/admin/users" element={<RequireRole allow={["admin"]}><AdminUsersPage /></RequireRole>} />
      <Route path="/admin/eye-tracking-test" element={<RequireRole allow={["admin"]}><AdminEyeTrackingTestPage /></RequireRole>} />
      <Route path="/admin/eye-tracking-test/:testSessionId" element={<RequireRole allow={["admin"]}><AdminEyeTrackingReportPage /></RequireRole>} />
      <Route path="/admin/system" element={<RequireRole allow={["admin"]}><AdminSystemPage /></RequireRole>} />
      <Route path="*" element={<StartPage />} />
    </Routes>
  );
}
