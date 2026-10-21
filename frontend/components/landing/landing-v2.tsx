"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  RiArrowRightUpLine,
  RiBarChartLine,
  RiBookOpenLine,
  RiCheckLine,
  RiCloseLine,
  RiEyeLine,
  RiMenuLine,
} from "@remixicon/react";
import { BrandLogo } from "@/components/ui/brand-logo";
import "./landing-v2.css";

type Role = "student" | "teacher";

const roles: Record<Role, { title: string; desc: string; points: string[] }> = {
  student: {
    title: "Chủ động với hành trình của mình.",
    desc: "Quản lý khóa học và đọc tài liệu bài giảng trong cùng một nơi.",
    points: [
      "Khóa học và tài liệu trong cùng một nơi",
      "Xem bài giảng dạng slide",
      "Xem lại kết quả và quá trình học",
    ],
  },
  teacher: {
    title: "Thấu hiểu cách người học tương tác.",
    desc: "Tổ chức nội dung giảng dạy và tham khảo trực quan hóa điểm nhìn để hiểu rõ hơn cách học viên tiếp cận tài liệu.",
    points: [
      "Tổ chức và quản lý khóa học",
      "Quan sát bản đồ nhiệt điểm nhìn",
      "Tham khảo dữ liệu hỗ trợ giảng dạy",
    ],
  },
};

const menuItems = [
  ["Giải pháp", "#features"],
  ["Cách hoạt động", "#how-it-works"],
  ["Dành cho ai?", "#roles"],
] as const;

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="ge-eyebrow">{children}</span>;
}

function Arrow() {
  return <RiArrowRightUpLine size={17} aria-hidden="true" />;
}

function Lines({ widths }: { widths: string[] }) {
  return (
    <>
      {widths.map((width, index) => (
        <div key={index} className={`ge-placeholder-line ${width}`} />
      ))}
    </>
  );
}

function ProductIllustration() {
  return (
    <div
      className="ge-hero-art"
      role="img"
      aria-label="Minh họa không gian học tập và phân tích ánh nhìn"
    >
      <div className="ge-app-shell">
        <aside className="ge-app-sidebar" aria-hidden="true">
          <div className="ge-sidebar-symbol">
            <RiEyeLine size={15} />
          </div>
          <div className="ge-sidebar-pill active">▦</div>
          <div className="ge-sidebar-pill">◫</div>
          <div className="ge-sidebar-pill">◉</div>
          <div className="ge-sidebar-pill">▤</div>
        </aside>
        <div className="ge-app-main">
          <div className="ge-app-top">
            <div>
              <div className="ge-app-caption">Không gian học tập</div>
              <div className="ge-app-sub">GazeEdu / Learning workspace</div>
            </div>
            <div className="ge-avatar">G</div>
          </div>
          <div className="ge-dash-title">Hành trình học của bạn</div>
          <p className="ge-dash-sub">Một không gian để học, theo dõi và nhìn lại.</p>
          <div className="ge-dash-grid">
            <div className="ge-dash-document">
              <div className="ge-dash-doc-label">Tài liệu học tập</div>
              <Lines widths={["dark w72", "w94", "w88", "w79", "w62", "w94", "w46"]} />
              <div className="ge-doc-footer">
                <b />
                <b />
                <b />
              </div>
            </div>
            <div className="ge-dash-activity">
              <div className="ge-dash-doc-label">Nhịp độ học tập</div>
              <div className="ge-activity-hint">Minh họa theo dõi quá trình</div>
              <div className="ge-activity-viz">
                <svg
                  viewBox="0 0 170 70"
                  preserveAspectRatio="none"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M0 56H170M0 33H170M0 10H170" stroke="#EEF2ED" />
                  <path
                    d="M2 53C17 53 17 27 31 36S48 49 60 31S82 28 95 35S117 53 131 28S153 39 168 15"
                    stroke="#8BAE89"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <path
                    d="M2 53C17 53 17 27 31 36S48 49 60 31S82 28 95 35S117 53 131 28S153 39 168 15V70H2Z"
                    fill="#E8F1E6"
                    opacity=".7"
                  />
                </svg>
              </div>
              <Lines widths={["w72"]} />
            </div>
          </div>
          <div className="ge-dash-bottom">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
      <div className="ge-hover-panel ge-float-heat">
        <div className="head">Vùng quan sát</div>
        <div className="ge-heat-mini">
          <span className="ge-heat-spot a" />
          <span className="ge-heat-spot b" />
        </div>
      </div>
      <div className="ge-hover-panel ge-float-signal">
        <div className="ge-signal-icon">
          <RiEyeLine size={21} />
        </div>
        <div>
          <strong>Webcam Eye-Tracking</strong>
          <small>Trực quan hóa điểm nhìn</small>
        </div>
        <div className="ge-bars">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

function CourseIllustration() {
  const items = ["Khóa học", "Tài liệu", "Bài kiểm tra"] as const;
  const covers = ["one", "two", "three"] as const;

  return (
    <div
      className="ge-course-graphic"
      role="img"
      aria-label="Minh họa thư viện các khóa học, không chứa dữ liệu thật"
    >
      <div className="ge-ui-top">
        <div className="ge-ui-dots">
          <i />
          <i />
          <i />
        </div>
        <span className="ge-ui-caption">Không gian của tôi</span>
        <span className="ge-ui-profile" />
      </div>
      <div className="ge-ui-mainhead">Mọi thứ bạn cần, trong một nơi.</div>
      <div className="ge-ui-sub">Thư viện học tập được tổ chức rõ ràng.</div>
      <div className="ge-course-row">
        {items.map((item, index) => (
          <div className="ge-course-item" key={item}>
            <div className={`ge-cover ${covers[index]}`} />
            <strong>{item}</strong>
            <div className="ge-ui-line" />
            <div className="ge-ui-line" />
          </div>
        ))}
      </div>
    </div>
  );
}

function GazeIllustration() {
  return (
    <div className="ge-mini-graphic" role="img" aria-label="Minh họa hiệu chuẩn điểm nhìn">
      <div className="ge-graphic-head">
        <span className="ge-status-dot" /> Hiệu chuẩn điểm nhìn
      </div>
      <div className="ge-gaze-plane">
        <div className="ge-cross" />
        <div className="ge-cross v" />
        <div className="ge-gaze-rings" />
      </div>
    </div>
  );
}

function HeatIllustration() {
  return (
    <div className="ge-mini-graphic" role="img" aria-label="Minh họa bản đồ nhiệt trên tài liệu">
      <div className="ge-graphic-head">
        <span className="ge-status-dot" /> Bản đồ nhiệt trên tài liệu
      </div>
      <div className="ge-heat-graphic">
        <div className="ge-heat-paper">
          <Lines widths={["w62", "w94", "w88", "w72", "w94"]} />
          <div className="ge-heat-layer" />
        </div>
        <div className="ge-legend">
          Mật độ thấp <span className="ge-legend-bar" /> Mật độ cao
        </div>
      </div>
    </div>
  );
}

export default function LandingV2() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRole] = useState<Role>("student");
  const current = roles[role];

  return (
    <div className="ge-page" id="top">
      <header className="ge-header">
        <div className="ge-container ge-nav">
          <Link className="ge-logo" href="/" aria-label="GazeEdu - Trang chủ">
            <BrandLogo variant="light" className="h-[28px]" priority />
          </Link>
          <nav className="ge-navlinks" aria-label="Điều hướng chính">
            {menuItems.map(([label, href]) => (
              <a href={href} key={href}>
                {label}
              </a>
            ))}
          </nav>
          <div className="ge-nav-actions">
            <Link href="/account/login" className="ge-login">
              Đăng nhập
            </Link>
            <Link className="ge-btn ge-btn-dark ge-btn-sm" href="/try">
              Bắt đầu khám phá <Arrow />
            </Link>
            <button
              type="button"
              className="ge-menu"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
            >
              {mobileOpen ? <RiCloseLine size={23} /> : <RiMenuLine size={23} />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="ge-mobile-panel" aria-label="Menu di động">
            {menuItems.map(([label, href]) => (
              <a href={href} key={href} onClick={() => setMobileOpen(false)}>
                {label}
              </a>
            ))}
            <Link href="/account/login">Đăng nhập</Link>
            <Link className="ge-btn ge-btn-dark" href="/try">
              Bắt đầu khám phá <Arrow />
            </Link>
          </nav>
        )}
      </header>
      <main>
        <section className="ge-hero" aria-labelledby="hero-title">
          <div className="ge-container ge-hero-grid">
            <div className="ge-hero-copy">
              <Eyebrow>Một góc nhìn mới về việc học</Eyebrow>
              <h1 id="hero-title">
                Không chỉ kết quả.
                <br />
                <span className="ge-emphasis">Hiểu cả quá trình học.</span>
              </h1>
              <p className="ge-lead">
                Học trực tuyến, kết hợp theo dõi ánh nhìn qua webcam. Cùng GazeEdu khám phá cách
                người học tương tác với kiến thức, từ đó hiểu rõ hơn hành trình học tập.
              </p>
              <div className="ge-hero-actions">
                <Link href="/try" className="ge-btn ge-btn-dark">
                  Khám phá GazeEdu <Arrow />
                </Link>
                <a href="#how-it-works" className="ge-btn ge-btn-ghost">
                  Cách hoạt động <span className="ge-arrow">→</span>
                </a>
              </div>
              <div className="ge-mini-proof">
                <span>
                  <i /> Học trực tuyến
                </span>
                <span>
                  <i /> Webcam Eye-Tracking
                </span>
                <span>
                  <i /> Learning Analytics
                </span>
              </div>
            </div>
            <ProductIllustration />
          </div>
        </section>
        <div className="ge-value-rail">
          <div className="ge-container ge-value-inner">
            <span className="ge-value-word">
              <RiBookOpenLine size={16} /> Không gian học tập
            </span>
            <span className="ge-value-sep" />
            <span className="ge-value-word">
              <RiEyeLine size={16} /> Theo dõi ánh nhìn
            </span>
            <span className="ge-value-sep" />
            <span className="ge-value-word">
              <RiBarChartLine size={16} /> Phân tích hành vi học
            </span>
            <span className="ge-value-sep" />
            <span className="ge-value-word">
              <RiCheckLine size={16} /> Trải nghiệm liền mạch
            </span>
          </div>
        </div>

        <section className="ge-section" id="features">
          <div className="ge-container">
            <div className="ge-section-head">
              <div>
                <Eyebrow>Được thiết kế cho việc học</Eyebrow>
                <h2>
                  Một nền tảng.
                  <br />
                  Nhiều điều để khám phá.
                </h2>
              </div>
              <p className="ge-section-desc">
                Từ bài học đầu tiên đến dữ liệu của cả hành trình, mọi trải nghiệm được kết nối
                trong cùng một không gian.
              </p>
            </div>
            <div className="ge-feature-grid">
              <article className="ge-feature ge-feature-big">
                <div className="ge-feature-copy">
                  <span className="ge-small-kicker">01 / KHÔNG GIAN HỌC TẬP</span>
                  <h3>
                    Học theo nhịp của bạn.
                    <br />
                    Tiếp nối mỗi ngày.
                  </h3>
                  <p>
                    Khóa học, tài liệu và bài kiểm tra được sắp xếp rõ ràng. Biến mỗi lần đăng
                    nhập thành một bước tiếp theo của hành trình học tập.
                  </p>
                  <ul className="ge-checks">
                    <li>
                      <span className="tick">✓</span> Quản lý khóa học tại một nơi
                    </li>
                    <li>
                      <span className="tick">✓</span> Đọc tài liệu, hoàn thành bài học
                    </li>
                    <li>
                      <span className="tick">✓</span> Xem lại kết quả học tập
                    </li>
                  </ul>
                  <Link href="/try" className="ge-text-link">
                    Khám phá không gian học tập <Arrow />
                  </Link>
                </div>
                <CourseIllustration />
              </article>
              <article className="ge-feature ge-feature-small">
                <span className="ge-small-kicker">02 / WEBCAM EYE-TRACKING</span>
                <h3>
                  Thêm một góc nhìn.
                  <br />
                  Chỉ từ webcam.
                </h3>
                <p>
                  Hiệu chuẩn trước phiên học để ghi nhận vị trí nhìn trên nội dung. Không cần
                  thiết bị eye-tracking chuyên dụng.
                </p>
                <GazeIllustration />
              </article>
              <article className="ge-feature ge-feature-small">
                <span className="ge-small-kicker">03 / LEARNING ANALYTICS</span>
                <h3>
                  Những điểm nhìn.
                  <br />
                  Một bức tranh rõ hơn.
                </h3>
                <p>
                  Heatmap thể hiện mật độ điểm nhìn trên từng trang tài liệu, giúp giảng viên
                  hiểu hành vi quan sát của người học.
                </p>
                <HeatIllustration />
              </article>
            </div>
          </div>
        </section>

        <section className="ge-steps" id="how-it-works">
          <div className="ge-container ge-steps-inner">
            <div className="ge-steps-copy">
              <Eyebrow>Cách hoạt động</Eyebrow>
              <h2>
                Ba bước.
                <br />
                Một hành trình liền mạch.
              </h2>
              <p>Học, quan sát, thấu hiểu — trong một trải nghiệm.</p>
            </div>
            <ol className="ge-step-list">
              {[
                [
                  "Bắt đầu học",
                  "Chọn khóa học, mở tài liệu và bắt đầu một phiên học tập.",
                  "▣",
                ],
                [
                  "Hiệu chuẩn ánh nhìn",
                  "Cho phép truy cập webcam và hiệu chuẩn để ghi nhận dữ liệu trong phiên học.",
                  "◎",
                ],
                [
                  "Khám phá dữ liệu",
                  "Xem những thông tin trực quan về hành vi quan sát.",
                  "▥",
                ],
              ].map(([heading, description, icon], index) => (
                <li key={heading}>
                  <span className="ge-step-num">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{heading}</strong>
                    <p>{description}</p>
                  </div>
                  <span className="ge-step-icon">{icon}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="ge-role-section" id="roles">
          <div className="ge-container ge-role-main">
            <div className="ge-role-head">
              <Eyebrow>Dành cho người học và người dạy</Eyebrow>
              <h2>
                Hỗ trợ người học.
                <br />
                Đồng hành người dạy.
              </h2>
              <p className="ge-description">
                Mỗi vai trò có một góc nhìn riêng, cùng hướng tới hành trình học tập rõ ràng hơn.
              </p>
            </div>
            <div className="ge-role-tabs-wrap">
              <div className="ge-tabs" role="tablist" aria-label="Vai trò sử dụng">
                {(["student", "teacher"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="ge-tab"
                    role="tab"
                    id={`role-${key}`}
                    aria-controls="ge-role-panel"
                    aria-selected={role === key}
                    onClick={() => setRole(key)}
                  >
                    {key === "student" ? "Người học" : "Giảng viên"}
                  </button>
                ))}
              </div>
              <div
                id="ge-role-panel"
                role="tabpanel"
                aria-labelledby={`role-${role}`}
                className="ge-role-detail"
              >
                <div className="ge-role-icon">
                  <RiBookOpenLine size={21} />
                </div>
                <div>
                  <h3>{current.title}</h3>
                  <p>{current.desc}</p>
                  <ul className="ge-role-points">
                    {current.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <Link href="/try" className="ge-text-link">
                    Khám phá trải nghiệm học tập <Arrow />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="ge-container">
          <section className="ge-cta">
            <div>
              <span className="ge-small-kicker">MỞ RA MỘT GÓC NHÌN MỚI</span>
              <h2>
                Việc học còn nhiều điều
                <br />
                để khám phá.
              </h2>
            </div>
            <div className="ge-cta-sub">
              <p>Bắt đầu hành trình của bạn với GazeEdu.</p>
              <Link className="ge-btn ge-btn-dark" href="/try">
                Bắt đầu với GazeEdu <Arrow />
              </Link>
            </div>
          </section>
        </div>
      </main>
      <footer className="ge-footer">
        <div className="ge-container">
          <div className="ge-footer-top">
            <div>
              <Link className="ge-logo" href="/">
                <BrandLogo variant="light" className="h-[28px]" />
              </Link>
              <p className="ge-footer-note">Học tập. Quan sát. Thấu hiểu.</p>
            </div>
            <nav className="ge-footer-links" aria-label="Điều hướng chân trang">
              {menuItems.map(([label, href]) => (
                <a href={href} key={href}>
                  {label}
                </a>
              ))}
            </nav>
          </div>
          <div className="ge-footer-bottom">
            <span>© GazeEdu</span>
            <span>Học tập. Quan sát. Thấu hiểu.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
