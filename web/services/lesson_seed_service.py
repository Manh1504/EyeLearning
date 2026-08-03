from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.models import AOIDefinition, Course, CourseEnrollment, Lesson, TeacherCourseAssignment, User


async def ensure_mlops_data_lesson(db: AsyncSession) -> None:
    course = await db.get(Course, "C002")
    if course:
        course.course_title = "MLOps"
        course.course_description = "Khóa học về data stage, scoping và vận hành hệ thống machine learning trong production."
    else:
        db.add(
            Course(
                course_id="C002",
                course_title="MLOps",
                course_description="Khóa học về data stage, scoping và vận hành hệ thống machine learning trong production.",
            )
        )

    lesson = await db.get(Lesson, "L002")
    if lesson:
        lesson.lesson_title = "Data Stage and Scoping"
        lesson.lesson_description = "Bài học được chuyển từ tài liệu MLOPs_data.pdf thành 54 slide học trong ELA."
        lesson.layout_version = "v1"
        lesson.course_id = "C002"
    else:
        db.add(
            Lesson(
                lesson_id="L002",
                lesson_title="Data Stage and Scoping",
                lesson_description="Bài học được chuyển từ tài liệu MLOPs_data.pdf thành 54 slide học trong ELA.",
                layout_version="v1",
                course_id="C002",
            )
        )

    aoi_rows = [
        ("AOI_SLIDE_CONTENT_L002", "transcript_panel", "Slide Content", ".slide-canvas", "slide", True),
        ("AOI_UI_CONTROLS_L002", "ui_controls", "Lesson Controls", ".lesson-controls", "control", False),
        ("AOI_LESSON_HEADER_L002", "lesson_header", "Lesson Header", ".lesson-viewer-header", "header", False),
    ]
    for aoi_id, aoi_key, aoi_name, selector, aoi_type, is_learning_area in aoi_rows:
        result = await db.execute(
            select(AOIDefinition).where(
                AOIDefinition.lesson_id == "L002",
                AOIDefinition.layout_version == "v1",
                AOIDefinition.aoi_key == aoi_key,
            )
        )
        aoi = result.scalar_one_or_none()
        if aoi:
            aoi.aoi_name = aoi_name
            aoi.css_selector = selector
            aoi.aoi_type = aoi_type
            aoi.is_learning_area = is_learning_area
            aoi.is_active = True
            continue
        db.add(
            AOIDefinition(
                aoi_id=aoi_id,
                lesson_id="L002",
                layout_version="v1",
                aoi_key=aoi_key,
                aoi_name=aoi_name,
                css_selector=selector,
                aoi_type=aoi_type,
                is_learning_area=is_learning_area,
                is_active=True,
            )
        )

    students = await db.execute(select(User.user_id).where(User.role == "student"))
    for student_id in students.scalars().all():
        enrollment = await db.get(CourseEnrollment, {"student_id": student_id, "course_id": "C002"})
        if enrollment:
            enrollment.status = "active"
            continue
        db.add(CourseEnrollment(student_id=student_id, course_id="C002", status="active"))

    teachers = await db.execute(select(User.user_id).where(User.role.in_(["teacher", "instructor"])))
    for teacher_id in teachers.scalars().all():
        assignment = await db.get(TeacherCourseAssignment, {"teacher_id": teacher_id, "course_id": "C002"})
        if not assignment:
            db.add(TeacherCourseAssignment(teacher_id=teacher_id, course_id="C002"))

    await db.flush()
