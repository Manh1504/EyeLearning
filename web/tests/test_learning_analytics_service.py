from types import SimpleNamespace
import unittest

from web.services.learning_analytics_service import (
    MIN_EXPECTED_COUNT,
    OUTSIDE_AOI,
    FixationEvent,
    benjamini_hochberg,
    build_fixations_for_session,
    summarize_slide_metrics,
    transition_matrix,
)


def session(session_id="S1", user_id="U1", lesson_id="L001"):
    return SimpleNamespace(session_id=session_id, user_id=user_id, lesson_id=lesson_id)


def point(
    index,
    *,
    timestamp_ms=None,
    aoi_id=None,
    slide_id="slide-1",
    target_zone=None,
    reliable=True,
    ui=False,
    transitioning=False,
    confidence=0.9,
):
    return SimpleNamespace(
        point_id=f"P{index}",
        timestamp_ms=timestamp_ms if timestamp_ms is not None else index * 100,
        aoi_id=aoi_id,
        confidence=confidence,
        metadata_json={
            "slide_id": slide_id,
            "target_zone": target_zone,
            "in_reliable_region": reliable,
            "ui_interaction": ui,
            "is_transitioning": transitioning,
            "slide_version": "v1",
        },
    )


def fixation(student, sess, slide, exposure, aoi, start):
    return FixationEvent(
        student_id=student,
        session_id=sess,
        lesson_id="L001",
        slide_id=slide,
        slide_version="v1",
        exposure_id=exposure,
        fixation_id=f"FX_{student}_{sess}_{slide}_{exposure}_{start}",
        aoi_key=aoi,
        started_at_ms=start,
        duration_ms=100,
        valid_sample_count=1,
        sample_count=1,
        tracking_coverage=1,
    )


class LearningAnalyticsServiceTest(unittest.TestCase):
    def test_tracking_coverage_filters_transition_ui_reliable_and_confidence(self):
        fixations, quality = build_fixations_for_session(
            session(),
            [
                point(0, aoi_id="A1"),
                point(1, aoi_id="A1", transitioning=True),
                point(2, aoi_id="A1", ui=True),
                point(3, aoi_id="A1", reliable=False),
                point(4, aoi_id="A1", confidence=0.2),
                point(5, aoi_id="A1"),
            ],
            {"A1": "content"},
        )
        self.assertEqual(quality["total_samples"], 6)
        self.assertEqual(quality["valid_content_samples"], 2)
        self.assertAlmostEqual(quality["tracking_coverage"], 2 / 6)
        self.assertEqual(len(fixations), 2)

    def test_outside_aoi_is_valid_content_without_mapping(self):
        fixations, _ = build_fixations_for_session(session(), [point(0), point(1)], {})
        self.assertEqual(len(fixations), 1)
        self.assertEqual(fixations[0].aoi_key, OUTSIDE_AOI)

    def test_no_transition_across_slide_or_exposure_boundary(self):
        fx = [
            fixation("U1", "S1", "slide-1", 1, "title", 100),
            fixation("U1", "S1", "slide-1", 1, "body", 200),
            fixation("U1", "S1", "slide-2", 1, "title", 300),
            fixation("U1", "S2", "slide-1", 1, "quiz", 100),
            fixation("U1", "S2", "slide-1", 2, "body", 200),
        ]
        matrix = transition_matrix(fx)
        pairs = {(row["source_aoi"], row["target_aoi"]) for row in matrix["transitions"]}
        self.assertIn(("title", "body"), pairs)
        self.assertNotIn(("body", "title"), pairs)
        self.assertNotIn(("quiz", "body"), pairs)

    def test_collapse_consecutive_identical_aoi(self):
        fx = [
            fixation("U1", "S1", "slide-1", 1, "title", 100),
            fixation("U1", "S1", "slide-1", 1, "title", 200),
            fixation("U1", "S1", "slide-1", 1, "body", 300),
        ]
        matrix = transition_matrix(fx)
        self.assertEqual(matrix["total_transitions"], 1)
        self.assertEqual(matrix["transitions"][0]["source_aoi"], "title")
        self.assertEqual(matrix["transitions"][0]["target_aoi"], "body")

    def test_expected_residual_p_value_and_fdr_are_present(self):
        fx = []
        for idx in range(6):
            fx.extend([
                fixation(f"U{idx}", f"S{idx}", "slide-1", 1, "title", 100),
                fixation(f"U{idx}", f"S{idx}", "slide-1", 1, "chart", 200),
                fixation(f"U{idx}", f"S{idx}", "slide-1", 1, "body", 300),
            ])
        matrix = transition_matrix(fx)
        self.assertEqual(matrix["status"], "ready")
        row = matrix["transitions"][0]
        self.assertIn("expected_count", row)
        self.assertIn("adjusted_residual", row)
        self.assertIn("p_value", row)
        self.assertIn("adjusted_p_value", row)
        self.assertGreaterEqual(row["expected_count"], MIN_EXPECTED_COUNT)

    def test_minimum_support_marks_small_expected_counts(self):
        fx = [
            fixation("U1", "S1", "slide-1", 1, "a", 100),
            fixation("U1", "S1", "slide-1", 1, "b", 200),
        ]
        matrix = transition_matrix(fx)
        self.assertEqual(matrix["status"], "insufficient_data")
        self.assertFalse(matrix["transitions"][0]["significant"])

    def test_rvt_uses_cohort_median_per_slide_version(self):
        fx = [
            fixation("U1", "S1", "slide-1", 1, "body", 100),
            fixation("U1", "S1", "slide-1", 1, "body", 200),
            fixation("U2", "S2", "slide-1", 1, "body", 100),
        ]
        quality = {"S1": {"tracking_coverage": 1}, "S2": {"tracking_coverage": 1}}
        summary = summarize_slide_metrics(fx, quality, {"U1": "Student 1", "U2": "Student 2"})
        rows = {row["student_id"]: row for row in summary["student_slide_rows"]}
        self.assertAlmostEqual(rows["U1"]["relative_viewing_time"], 4 / 3)
        self.assertAlmostEqual(rows["U2"]["relative_viewing_time"], 2 / 3)

    def test_bh_correction_is_monotonic_in_sorted_order(self):
        adjusted = benjamini_hochberg([0.01, 0.04, 0.03])
        self.assertEqual(len(adjusted), 3)
        self.assertLessEqual(adjusted[0], adjusted[2])
        self.assertLessEqual(adjusted[2], adjusted[1])


if __name__ == "__main__":
    unittest.main()
