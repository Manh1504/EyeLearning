import { Routes, Route } from "react-router-dom";
import StartPage from "./pages/StartPage.jsx";
import LessonPage from "./pages/LessonPage.jsx";
import CalibrationPage from "./pages/CalibrationPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import TeacherPage from "./pages/TeacherPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StartPage />} />
      <Route path="/lesson" element={<LessonPage />} />
      <Route path="/calibration" element={<CalibrationPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/teacher" element={<TeacherPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<StartPage />} />
    </Routes>
  );
}
