import { Link } from "react-router-dom";

const FEATURES = [
  ["Học trực tuyến", "Tổ chức bài học, transcript, quiz và ghi chú trong một không gian học tập thống nhất."],
  ["Eye-tracking", "Ước tính vùng nhìn trong phiên học khi người học chủ động cho phép camera."],
  ["Learning analytics", "Tổng hợp tín hiệu học tập theo AOI để giảng viên cải thiện nội dung và hỗ trợ lớp học."],
];

export default function StartPage() {
  return (
    <>
      <header className="topbar landing-nav">
        <div className="brand">ELA</div>
        <nav className="role-nav" aria-label="Landing navigation">
          <a href="#features">Tính năng</a>
          <a href="#workflow">Cách hoạt động</a>
          <a href="#privacy">Quyền riêng tư</a>
        </nav>
        <Link className="btn primary" to="/login">Đăng nhập</Link>
      </header>

      <main className="landing-page">
        <section className="landing-hero">
          <div className="landing-copy">
            <div className="course-kicker">ELA · Eye Learning Analytics</div>
            <h1>Nền tảng LMS hiểu cách người học tương tác với bài giảng.</h1>
            <p>
              ELA dành cho sinh viên, giảng viên và quản trị viên cần một hệ thống học trực tuyến có
              eye-tracking minh bạch, analytics theo bài học và kiểm soát dữ liệu rõ ràng.
            </p>
            <div className="hero-actions">
              <Link className="btn primary" to="/login">Đăng nhập</Link>
              <a className="btn" href="#features">Khám phá nền tảng</a>
              <Link className="btn" to="/login">Xem bài học mẫu</Link>
            </div>
          </div>

          <div className="landing-visual" aria-label="ELA learning analytics preview">
            <div className="visual-header">
              <span>Live lesson</span>
              <strong>Đọc biểu đồ dữ liệu</strong>
            </div>
            <div className="visual-slide">
              <h2>So sánh xu hướng theo thời gian</h2>
              <div className="chart-bars">
                <span></span><span></span><span></span><span></span><span></span>
              </div>
              <div className="heat-spot heat-spot-one"></div>
              <div className="heat-spot heat-spot-two"></div>
            </div>
            <div className="visual-stats">
              <div><span>AOI-mapped</span><strong>76%</strong></div>
              <div><span>Signal quality</span><strong>87</strong></div>
              <div><span>Privacy</span><strong>Consent</strong></div>
            </div>
          </div>
        </section>

        <section className="landing-section" id="features">
          <div className="section-heading">
            <div className="course-kicker">Tính năng chính</div>
            <h2>Một LMS cho học, đo lường và cải tiến bài giảng.</h2>
          </div>
          <div className="feature-grid">
            {FEATURES.map(([title, body]) => (
              <article className="panel feature-card" key={title}>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section split-section" id="workflow">
          <div>
            <div className="course-kicker">Cách hệ thống hoạt động</div>
            <h2>Từ đăng nhập đến analytics sau buổi học.</h2>
          </div>
          <div className="workflow-list">
            {[
              "Đăng nhập và vào trang chủ theo vai trò.",
              "Sinh viên chọn khóa học, kiểm tra camera và hiệu chỉnh ánh nhìn.",
              "Phiên học ghi tracking points theo vùng AOI đã định nghĩa.",
              "Giảng viên xem dashboard lớp học và heatmap tổng hợp sau phiên.",
            ].map((item, index) => (
              <div className="workflow-step" key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-section privacy-band" id="privacy">
          <div>
            <div className="course-kicker">Cam kết dữ liệu</div>
            <h2>Camera và ánh nhìn luôn cần sự đồng ý rõ ràng.</h2>
          </div>
          <p>
            ELA chỉ dùng eye-tracking như tín hiệu kỹ thuật và tương tác học tập. Hệ thống không suy
            diễn mức độ hiểu bài, thái độ hay năng lực cá nhân từ camera. Người học có thể biết khi
            nào camera bật, dữ liệu nào được gửi và phiên nào đang được ghi nhận.
          </p>
        </section>
      </main>
    </>
  );
}
