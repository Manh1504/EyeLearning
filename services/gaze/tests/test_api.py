import numpy as np
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.api import session as session_api
from app.main import app
from app.services import inference


class FakePipeline:
    def __init__(self, result=(0.1, 0.2)):
        self.result = result

    def process(self, frame):
        return self.result


@pytest.fixture(autouse=True)
def fake_inference(monkeypatch):
    """Cắm pipeline giả + giả lập decode JPEG -> không cần torch/mediapipe/opencv."""
    inference.set_pipeline(FakePipeline())
    monkeypatch.setattr(
        inference, "decode_jpeg", lambda data: np.zeros((4, 4, 3), dtype=np.uint8)
    )
    session_api.sessions._sessions.clear()
    yield
    inference.set_pipeline(None)
    session_api.sessions._sessions.clear()


@pytest.fixture
def client():
    # Không dùng context manager -> bỏ qua lifespan (không load pipeline thật).
    return TestClient(app)


POINTS = [
    {"id": "a", "x": 0.1, "y": 0.1},
    {"id": "b", "x": 0.9, "y": 0.1},
    {"id": "c", "x": 0.5, "y": 0.5},
]


def _create(client, points=POINTS):
    resp = client.post("/session", json={"points": points})
    assert resp.status_code == 200, resp.text
    return resp.json()["session_id"]


def _calibrate(client, sid, point_id, content=b"jpeg"):
    return client.post(
        f"/session/{sid}/calibrate",
        files={"image": ("f.jpg", content, "image/jpeg")},
        data={"point_id": point_id},
    )


def test_health_and_ready(client):
    assert client.get("/health").status_code == 200

    assert client.get("/ready").status_code == 200
    inference.set_pipeline(None)
    assert client.get("/ready").status_code == 503
    inference.set_pipeline(FakePipeline())  # trả lại cho teardown


def test_create_requires_points(client):
    assert client.post("/session", json={"points": []}).status_code == 422


def test_create_and_status_and_delete(client):
    sid = _create(client)

    status = client.get(f"/session/{sid}").json()
    assert status == {"state": "collecting", "calibrated": False}

    assert client.delete(f"/session/{sid}").json() == {"status": "deleted"}
    assert client.get(f"/session/{sid}").status_code == 404
    assert client.delete(f"/session/{sid}").status_code == 404


def test_calibrate_unknown_point(client):
    sid = _create(client)
    resp = _calibrate(client, sid, "zzz")
    assert resp.json() == {"status": "unknown_point", "count": None}


def test_calibrate_no_face(client):
    inference.set_pipeline(FakePipeline(result=None))
    sid = _create(client)
    assert _calibrate(client, sid, "a").json()["status"] == "no_face"


def test_calibrate_accepted(client):
    sid = _create(client)
    body = _calibrate(client, sid, "a").json()
    assert body["status"] == "accepted"
    assert body["count"] == 1


def test_train_insufficient(client):
    sid = _create(client)
    _calibrate(client, sid, "a")  # thiếu b và c
    resp = client.post(f"/session/{sid}/train")
    assert resp.status_code == 422
    assert resp.json()["detail"]["b"] == 0


def test_train_ok_with_mae(client):
    sid = _create(client)
    for p in POINTS:
        _calibrate(client, sid, p["id"])
    body = client.post(f"/session/{sid}/train").json()
    assert body["status"] == "ok"
    assert body["n_samples"] == 3
    assert isinstance(body["mae_px"], float)
    assert client.get(f"/session/{sid}").json()["calibrated"] is True


def test_train_single_point_has_null_mae(client):
    sid = _create(client, points=[{"id": "a", "x": 0.5, "y": 0.5}])
    _calibrate(client, sid, "a")
    body = client.post(f"/session/{sid}/train").json()
    assert body["mae_px"] is None  # không còn NaN -> JSON hợp lệ


def test_model_download_requires_ready(client):
    sid = _create(client)
    assert client.get(f"/session/{sid}/model").status_code == 409


def test_model_export_import_roundtrip(client):
    sid = _create(client)
    for p in POINTS:
        _calibrate(client, sid, p["id"])
    client.post(f"/session/{sid}/train")

    model = client.get(f"/session/{sid}/model").content
    assert model

    sid2 = _create(client)
    resp = client.post(
        f"/session/{sid2}/import",
        files={"model": ("m.ubj", model, "application/octet-stream")},
    )
    assert resp.json() == {"status": "ready"}
    assert client.get(f"/session/{sid2}").json()["calibrated"] is True


def test_import_invalid_model(client):
    sid = _create(client)
    resp = client.post(
        f"/session/{sid}/import",
        files={"model": ("m.ubj", b"not-a-model", "application/octet-stream")},
    )
    assert resp.json() == {"status": "invalid_model"}


def test_stream_returns_point(client):
    sid = _create(client)
    for p in POINTS:
        _calibrate(client, sid, p["id"])
    client.post(f"/session/{sid}/train")

    with client.websocket_connect(f"/session/{sid}/stream") as ws:
        ws.send_bytes(b"jpeg")
        body = ws.receive_json()
    assert body["ok"] is True
    assert isinstance(body["x"], float)


def test_stream_not_ready_closes_1008(client):
    sid = _create(client)
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/session/{sid}/stream") as ws:
            ws.receive_json()
    assert exc.value.code == 1008
