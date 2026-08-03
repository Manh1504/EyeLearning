import { Routes, Route } from "react-router-dom";
import StartPage from "./pages/StartPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import CoursesPage from "./pages/CoursesPage.jsx";
import CourseDetailPage from "./pages/CourseDetailPage.jsx";
import LessonPage from "./pages/LessonPage.jsx";
import CalibrationPage from "./pages/CalibrationPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import TeacherPage from "./pages/TeacherPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
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
      <Route path="/analytics" element={<RequireRole allow={["teacher", "admin"]}><AnalyticsPage /></RequireRole>} />
      <Route path="/teacher" element={<RequireRole allow={["teacher", "admin"]}><TeacherPage /></RequireRole>} />
      <Route path="/admin" element={<RequireRole allow={["admin"]}><AdminPage /></RequireRole>} />
      <Route path="*" element={<StartPage />} />
    </Routes>
  );
}
