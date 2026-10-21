import numpy as np
import pytest

from app.services.calibration import FORMAT, Calibration


def _linear_samples(n=20, seed=0):
    rng = np.random.default_rng(seed)
    X = rng.uniform(-30, 30, size=(n, 2))
    # quan hệ tuyến tính biết trước: x = 0.01*pitch + 0.02*yaw + 0.5 ; y = ...
    coef = np.array([[0.01, 0.0], [0.02, -0.015]])
    intercept = np.array([0.5, 0.4])
    y = X @ coef + intercept
    return X, y, coef, intercept


def test_fit_predict_recovers_linear_map():
    X, y, coef, intercept = _linear_samples()
    calib = Calibration()
    calib.fit(X, y)

    assert calib.ready
    # _coef được xếp để `coef @ [pitch, yaw]` -> [x, y], tức chuyển vị của `coef`
    # dùng trong công thức tạo dữ liệu (X @ coef).
    np.testing.assert_allclose(calib._coef, coef.T, atol=1e-9)
    np.testing.assert_allclose(calib._intercept, intercept, atol=1e-9)

    x, yy = calib.predict(*X[0])
    np.testing.assert_allclose([x, yy], y[0], atol=1e-9)


def test_predict_before_fit_raises():
    with pytest.raises(RuntimeError):
        Calibration().predict(0.0, 0.0)


def test_fit_empty_raises():
    with pytest.raises(ValueError):
        Calibration().fit([], [])


def test_serialize_deserialize_roundtrip():
    X, y, _, _ = _linear_samples()
    calib = Calibration()
    calib.fit(X, y)

    data = calib.serialize()
    restored = Calibration()
    restored.deserialize(data)

    assert restored.ready
    np.testing.assert_allclose(restored._coef, calib._coef)
    np.testing.assert_allclose(restored._intercept, calib._intercept)
    assert restored.predict(1.0, 2.0) == calib.predict(1.0, 2.0)


def test_serialize_before_fit_raises():
    with pytest.raises(RuntimeError):
        Calibration().serialize()


def test_deserialize_rejects_non_ubjson_bytes():
    with pytest.raises(ValueError):
        Calibration().deserialize(b"\x80\x04not-ubjson-pickle")


def test_deserialize_rejects_wrong_format():
    import ubjson

    payload = ubjson.dumpb({"format": "something-else", "coef": [[1, 0], [0, 1]], "intercept": [0, 0]})
    with pytest.raises(ValueError):
        Calibration().deserialize(payload)


def test_deserialize_rejects_wrong_shape():
    import ubjson

    bad = ubjson.dumpb({"format": FORMAT, "coef": [[1, 0, 0]], "intercept": [0, 0]})
    with pytest.raises(ValueError):
        Calibration().deserialize(bad)


def test_deserialize_rejects_non_finite():
    import ubjson

    bad = ubjson.dumpb({"format": FORMAT, "coef": [[1, 0], [0, float("inf")]], "intercept": [0, 0]})
    with pytest.raises(ValueError):
        Calibration().deserialize(bad)


def test_deserialize_rejects_empty():
    with pytest.raises(ValueError):
        Calibration().deserialize(b"")


def test_evaluate_returns_none_when_less_than_three_samples():
    calib = Calibration()
    X = np.array([[1.0, 2.0], [3.0, 4.0]])
    y = np.array([[0.1, 0.2], [0.3, 0.4]])

    assert calib.evaluate(X, y) is None
    assert calib.ready  # vẫn fit full để dùng được


def test_evaluate_returns_float_when_enough_samples():
    X, y, _, _ = _linear_samples()
    calib = Calibration()

    mae = calib.evaluate(X, y)

    assert isinstance(mae, float)
    assert mae >= 0.0
    assert mae < 1e-9  # dữ liệu tuyến tính hoàn hảo
