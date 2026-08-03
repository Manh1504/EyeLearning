const DATA_VIS_READING = {
  activity_id: "ACT_L001_intro_reading",
  activity_type: "TEXT",
  title: "Bài đọc giới thiệu",
  description: "Ba câu hỏi nền trước khi đọc biểu đồ và nguyên tắc tách quan sát khỏi kết luận.",
  estimated_duration_min: 4,
  tracking_enabled: false,
  content: {
    eyebrow: "Bài đọc",
    title: "Trước khi đọc biểu đồ, hãy xác định câu hỏi dữ liệu",
    body: "Người học nên bắt đầu từ câu hỏi mà biểu đồ cố gắng trả lời, sau đó mới nhìn vào trục, đơn vị đo và bối cảnh dữ liệu.",
    bullets: [
      "Biểu đồ đang trả lời câu hỏi nào?",
      "Trục, đơn vị đo và khoảng thời gian là gì?",
      "Điểm nổi bật nào cần kiểm tra lại bằng ngữ cảnh dữ liệu?",
    ],
  },
};

const DATA_VIS_SLIDE_DECK = {
  activity_id: "ACT_L001_slide_deck",
  activity_type: "SLIDE_DECK",
  title: "Nhận diện thành phần biểu đồ",
  description: "Học qua từng slide về cấu trúc, ví dụ và video minh họa.",
  estimated_duration_min: 8,
  tracking_enabled: true,
  slides: [
    {
      id: "intro",
      type: "title",
      eyebrow: "Slide mở đầu",
      title: "Đọc biểu đồ dữ liệu",
      subtitle: "Nhận diện loại biểu đồ, đọc trục và diễn giải xu hướng có kiểm chứng.",
    },
    {
      id: "theory",
      type: "text",
      eyebrow: "Khái niệm",
      title: "Ba câu hỏi trước khi đọc biểu đồ",
      bullets: [
        "Biểu đồ đang trả lời câu hỏi nào?",
        "Trục, đơn vị đo và khoảng thời gian là gì?",
        "Điểm nổi bật nào cần được kiểm chứng bằng ngữ cảnh dữ liệu?",
      ],
    },
    {
      id: "structure",
      type: "image",
      eyebrow: "Cấu trúc",
      title: "Nhận diện thành phần chính của biểu đồ",
      body: "Một biểu đồ tốt thường có tiêu đề rõ, trục có đơn vị, chú giải dễ hiểu và khoảng dữ liệu nhất quán.",
    },
    {
      id: "video",
      type: "media",
      eyebrow: "Ví dụ có hướng dẫn",
      title: "Quan sát cách đọc biểu đồ đường",
      body: "Người dạy đi từ tổng quan, đọc trục, xác định xu hướng chính rồi kiểm tra điểm bất thường.",
    },
    {
      id: "example",
      type: "example",
      eyebrow: "Ví dụ thực hành",
      title: "Doanh thu theo tháng",
      body: "Từ tháng 1 đến tháng 5, xu hướng tăng đều. Tháng 6 giảm nhẹ nên cần kiểm tra thêm sự kiện hoặc thay đổi dữ liệu.",
    },
  ],
};

const DATA_VIS_QUIZ = {
  activity_id: "ACT_L001_quiz",
  activity_type: "QUIZ",
  title: "Kiểm tra kiến thức",
  description: "Câu hỏi ngắn để xác nhận khi nào nên dùng biểu đồ đường.",
  estimated_duration_min: 5,
  tracking_enabled: false,
  question: "Biểu đồ đường phù hợp nhất để thể hiện điều gì?",
  options: [
    "Tỷ lệ thành phần tại một thời điểm",
    "Xu hướng thay đổi theo thời gian",
    "Danh sách nhãn phân loại",
  ],
  correctIndex: 1,
  feedbackTitle: "Đáp án: xu hướng thay đổi theo thời gian",
  feedbackBullets: [
    "Biểu đồ đường nhấn mạnh sự thay đổi liên tục.",
    "Mỗi điểm dữ liệu đại diện cho một thời điểm hoặc một giai đoạn.",
    "Đường nối giúp người đọc nhận ra chiều hướng tăng, giảm hoặc dao động.",
  ],
};

const DATA_VIS_SUMMARY = {
  activity_id: "ACT_L001_summary",
  activity_type: "TEXT",
  title: "Tổng kết bài học",
  description: "Tóm tắt ba nguyên tắc khi đọc biểu đồ.",
  estimated_duration_min: 3,
  tracking_enabled: false,
  content: {
    eyebrow: "Tổng kết",
    title: "Khi đọc biểu đồ, hãy tách quan sát khỏi kết luận",
    bullets: [
      "Mô tả điều nhìn thấy trước.",
      "Kiểm tra trục, đơn vị và nguồn dữ liệu.",
      "Chỉ kết luận khi có đủ ngữ cảnh.",
    ],
  },
};

const MLOPS_SLIDE_DECK = {
  activity_id: "ACT_L002_slide_deck",
  activity_type: "SLIDE_DECK",
  title: "Data Stage and Scoping",
  description: "Bản trình bày PDF được chia theo từng trang để học và tracking theo slide.",
  estimated_duration_min: 20,
  tracking_enabled: true,
  slides: Array.from({ length: 54 }, (_, index) => {
    const page = index + 1;
    return {
      id: `mlops-data-${String(page).padStart(2, "0")}`,
      type: "pdf-page",
      eyebrow: "Slide",
      title: `Trang ${page}`,
      page,
      totalPages: 54,
      imageSrc: `/lesson-assets/mlops-data/slide-${String(page).padStart(2, "0")}.png`,
    };
  }),
};

export const LESSON_REGISTRY = {
  L001: {
    title: "Đọc biểu đồ dữ liệu",
    subtitle: "Nắm cấu trúc biểu đồ, theo dõi ví dụ và kiểm tra kiến thức theo từng hoạt động.",
    modules: [
      {
        module_id: "MOD_L001_1",
        title: "Chương 1",
        lessons: [
          {
            lesson_id: "L001",
            title: "Đọc biểu đồ dữ liệu",
            activities: [DATA_VIS_READING, DATA_VIS_SLIDE_DECK, DATA_VIS_QUIZ, DATA_VIS_SUMMARY],
          },
        ],
      },
    ],
  },
  L002: {
    title: "Data Stage and Scoping",
    subtitle: "From Machine Learning Models to Production Systems",
    modules: [
      {
        module_id: "MOD_L002_1",
        title: "Chương 1",
        lessons: [
          {
            lesson_id: "L002",
            title: "Data Stage and Scoping",
            activities: [MLOPS_SLIDE_DECK],
          },
        ],
      },
    ],
  },
};

export function getLessonPlan(lessonId) {
  return LESSON_REGISTRY[lessonId] || LESSON_REGISTRY.L001;
}

export function getLessonTitle(lessonId) {
  return getLessonPlan(lessonId).title;
}

export function getLessonActivities(lessonId) {
  const plan = getLessonPlan(lessonId);
  return plan.modules.flatMap((module) =>
    module.lessons.flatMap((lesson) =>
      lesson.activities.map((activity) => ({
        ...activity,
        module_id: module.module_id,
        module_title: module.title,
        lesson_id: lesson.lesson_id,
        lesson_title: lesson.title,
      }))
    )
  );
}

export function buildLessonSequence(lessonId) {
  return getLessonActivities(lessonId).flatMap((activity) => {
    if (activity.activity_type === "SLIDE_DECK") {
      return activity.slides.map((slide, slideIndex) => ({
        unit_id: `${activity.activity_id}:${slide.id}`,
        activity,
        slide,
        slideIndex,
        kind: "slide",
        title: slide.title,
      }));
    }
    return [
      {
        unit_id: activity.activity_id,
        activity,
        kind: "activity",
        title: activity.title,
      },
    ];
  });
}

export function getLessonSlides(lessonId) {
  return buildLessonSequence(lessonId)
    .filter((unit) => unit.kind === "slide")
    .map((unit) => unit.slide);
}
