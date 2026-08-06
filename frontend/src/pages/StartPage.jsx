import { Link } from "react-router-dom";

const CAPABILITIES = [
  {
    icon: "lesson",
    title: "Tổ chức bài học",
    description: "Quản lý khóa học, bài giảng PDF và tiến độ học tập trong một không gian thống nhất.",
  },
  {
    icon: "attention",
    title: "Ghi nhận điểm nhìn",
    description: "Ghi lại vị trí nhìn theo từng trang trong các phiên học được người học chủ động cho phép.",
  },
  {
    icon: "improve",
    title: "Phân tích để cải thiện",
    description: "Tổng hợp heatmap và tín hiệu theo trang để giáo viên điều chỉnh nội dung.",
  },
];

const WORKFLOW_STEPS = [
  ["Chuẩn bị phiên học", "Chọn khóa học, bài giảng và hồ sơ hiệu chỉnh phù hợp."],
  ["Kiểm tra camera và hiệu chỉnh", "Xác nhận quyền camera, môi trường học và độ ổn định."],
  ["Học và ghi nhận điểm nhìn", "GazeEdu ghi nhận điểm nhìn theo từng trang khi có đồng ý."],
  ["Xem kết quả phân tích", "Giáo viên xem heatmap và vùng nội dung cần xem xét thêm."],
];

const PRIVACY_PRINCIPLES = [
  "Chủ động cấp quyền camera",
  "Luôn hiển thị trạng thái ghi nhận",
  "Phân quyền truy cập theo vai trò",
];

function CapabilityIcon({ type }) {
  if (type === "attention") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 12s3.2-5.5 9-5.5S21 12 21 12s-3.2 5.5-9 5.5S3 12 3 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (type === "improve") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 19h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M7 16v-4M12 16V7M17 16v-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="m7 10 5-5 5 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 4.75h9.5A2.5 2.5 0 0 1 18 7.25v12H8.5A2.5 2.5 0 0 1 6 16.75v-12Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8.25h6M9 11.75h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export default function StartPage() {
  return (
    <>
      <header className="gaze-landing-header">
        <div className="gaze-landing-header__inner">
          <div className="gaze-landing-brand" aria-label="GazeEdu">
            <span className="gaze-landing-brand__mark" aria-hidden="true">G</span>
            <span>GazeEdu</span>
          </div>
          <nav className="gaze-landing-nav" aria-label="Landing navigation">
            <a href="#features">Tính năng</a>
            <a href="#workflow">Cách hoạt động</a>
            <a href="#teachers">Dành cho giáo viên</a>
            <a href="#privacy">Quyền riêng tư</a>
          </nav>
          <Link className="gaze-landing-login" to="/login">Đăng nhập</Link>
        </div>
      </header>

      <main className="landing-page gaze-landing">
        <section className="gaze-landing-hero gazeedu-landing-hero">
          <div className="gaze-landing-copy gazeedu-landing-hero-copy">
            <div className="gaze-landing-eyebrow">GAZEEDU · EYE-TRACKING LEARNING ANALYTICS</div>
            <h1>Biết người học nhìn vào đâu trong từng bài giảng.</h1>
            <p>
              GazeEdu giúp giáo viên nhận biết vùng nội dung được nhìn nhiều, bị bỏ qua
              hoặc cần xem xét thêm thông qua dữ liệu điểm nhìn trong từng phiên học.
            </p>
            <p className="gaze-landing-consent">
              <span aria-hidden="true">✓</span>
              Camera chỉ được sử dụng khi người học chủ động đồng ý.
            </p>
            <div className="gaze-landing-actions">
              <a className="gaze-landing-action gaze-landing-action--primary" href="#features">Khám phá nền tảng</a>
              <a className="gaze-landing-action gaze-landing-action--secondary" href="#workflow">Xem cách hoạt động</a>
            </div>
          </div>

          <div className="gazeedu-landing-hero-visual" aria-hidden="true">
            <div className="gazeedu-landing-hero-blob">
              <img
                src="/landing/gazeedu-hero-illustration.svg"
                alt=""
                width="1200"
                height="980"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </div>
          </div>
        </section>

        <section className="gaze-landing-section gaze-value-section" id="features">
          <span className="landing-anchor" id="teachers" aria-hidden="true" />
          <div className="gaze-section-heading">
            <p>Giá trị cốt lõi</p>
            <h2>Không chỉ tổ chức lớp học, mà còn giúp cải thiện bài giảng.</h2>
          </div>
          <div className="gaze-capability-row">
            {CAPABILITIES.map((item) => (
              <article className="gaze-capability" key={item.title}>
                <span className="gaze-capability__icon">
                  <CapabilityIcon type={item.icon} />
                </span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="gaze-landing-section gaze-workflow-section" id="workflow">
          <div className="gaze-section-heading gaze-section-heading--center">
            <p>Cách hoạt động</p>
            <h2>Một phiên học với GazeEdu diễn ra thế nào?</h2>
          </div>
          <ol className="gaze-workflow-timeline">
            {WORKFLOW_STEPS.map(([title, body], index) => (
              <li className="gaze-workflow-step" key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="gaze-landing-section gaze-privacy-section" id="privacy">
          <div className="gaze-permission-ui" aria-label="Minh họa hộp thoại quyền camera">
            <div className="gaze-permission-ui__browser">
              <span />
              <span />
              <span />
              <strong>gazeedu.local/session</strong>
            </div>
            <div className="gaze-permission-ui__camera">
              <div className="gaze-permission-ui__frame">
                <span className="gaze-permission-ui__face" />
                <span className="gaze-permission-ui__scan gaze-permission-ui__scan--one" />
                <span className="gaze-permission-ui__scan gaze-permission-ui__scan--two" />
              </div>
              <div className="gaze-permission-ui__dialog">
                <strong>Cho phép sử dụng camera?</strong>
                <p>GazeEdu cần quyền camera để ghi nhận điểm nhìn trong phiên học này.</p>
                <div>
                  <button type="button">Từ chối</button>
                  <button type="button">Cho phép</button>
                </div>
              </div>
            </div>
          </div>

          <div className="gaze-privacy-copy">
            <div className="gaze-section-heading">
              <p>Quyền riêng tư</p>
              <h2>Quyền riêng tư được thiết kế ngay từ đầu.</h2>
            </div>
            <p>
              Camera chỉ được kích hoạt sau khi người học đồng ý. Trước mỗi phiên,
              GazeEdu hiển thị rõ dữ liệu được xử lý, mục đích sử dụng và ai có quyền
              xem kết quả phân tích.
            </p>
            <ul className="gaze-privacy-principles">
              {PRIVACY_PRINCIPLES.map((item) => (
                <li key={item}>
                  <span aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="gaze-closing-cta" aria-labelledby="gaze-closing-title">
              <h2 id="gaze-closing-title">Sẵn sàng sử dụng GazeEdu?</h2>
              <Link className="gaze-landing-action gaze-landing-action--primary" to="/login">Đăng nhập</Link>
            </div>
          </div>
        </section>

        <footer className="gaze-landing-footer">
          <span>© 2026 GazeEdu</span>
          <a href="#privacy">Quyền riêng tư</a>
          <a href="#privacy">Điều khoản sử dụng</a>
        </footer>
      </main>
    </>
  );
}
