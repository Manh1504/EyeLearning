"""Test bộ lọc làm mượt One-Euro (numpy-only, không cần torch/mediapipe)."""

import math

import app.services.smoothing as smoothing
from app.services.smoothing import OneEuroFilter2D


class _Clock:
    """Đồng hồ giả để dt xác định (không phụ thuộc thời gian thật)."""

    def __init__(self, step: float = 0.033):
        self.t = 0.0
        self.step = step

    def monotonic(self) -> float:
        self.t += self.step
        return self.t


def test_first_sample_passthrough():
    f = OneEuroFilter2D()
    assert f.process([0.2, 0.8]) == [0.2, 0.8]


def test_output_finite_and_within_input_range(monkeypatch):
    monkeypatch.setattr(smoothing, "time", _Clock())
    f = OneEuroFilter2D()
    f.process([0.0, 0.0])
    out = f.process([1.0, 1.0])
    assert all(math.isfinite(v) for v in out)
    # Không vượt quá biên của input (0..1)
    assert 0.0 <= out[0] <= 1.0
    assert 0.0 <= out[1] <= 1.0


def test_constant_signal_converges(monkeypatch):
    monkeypatch.setattr(smoothing, "time", _Clock())
    f = OneEuroFilter2D()
    target = [0.5, 0.25]
    last = None
    for _ in range(300):
        last = f.process(target)
    assert abs(last[0] - 0.5) < 1e-2
    assert abs(last[1] - 0.25) < 1e-2


def test_non_positive_dt_returns_previous(monkeypatch):
    # Cùng timestamp -> dt = 0 -> trả lại giá trị trước đó (không chia cho 0).
    class _Frozen:
        def monotonic(self) -> float:
            return 100.0

    monkeypatch.setattr(smoothing, "time", _Frozen())
    f = OneEuroFilter2D()
    assert f.process([0.1, 0.2]) == [0.1, 0.2]
    assert f.process([0.9, 0.9]) == [0.1, 0.2]


def test_higher_beta_tracks_input_faster(monkeypatch):
    def run(beta: float) -> float:
        monkeypatch.setattr(smoothing, "time", _Clock())
        f = OneEuroFilter2D(min_cutoff=0.5, beta=beta)
        for _ in range(5):
            f.process([0.0, 0.0])
        for _ in range(3):
            f.process([0.6, 0.6])
        return float(f.x_prev[0])

    # beta lớn -> cutoff lớn -> alpha lớn -> bám input nhanh hơn.
    assert run(0.5) > run(0.0)


def test_higher_d_cutoff_smooths_velocity_less(monkeypatch):
    # d_cutoff cao -> alpha của khâu vận tốc lớn -> dx_prev bám dx tức thời hơn
    # (ít làm mượt vận tốc) -> thích ứng tốc độ nhanh hơn.
    def velocity_after_step(d_cutoff: float) -> float:
        monkeypatch.setattr(smoothing, "time", _Clock())
        f = OneEuroFilter2D(min_cutoff=0.5, beta=0.0, d_cutoff=d_cutoff)
        f.process([0.0, 0.0])
        f.process([0.6, 0.6])
        return float(abs(f.dx_prev[0]))

    assert velocity_after_step(5.0) > velocity_after_step(0.5)
