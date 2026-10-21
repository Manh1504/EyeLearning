import pytest
from pydantic import ValidationError

from app.schemas import SessionRequest


def test_valid_request():
    req = SessionRequest(points=[{"id": "c", "x": 0.5, "y": 0.5}])
    assert req.points[0].id == "c"


def test_empty_points_rejected():
    with pytest.raises(ValidationError):
        SessionRequest(points=[])


def test_out_of_range_rejected():
    with pytest.raises(ValidationError):
        SessionRequest(points=[{"id": "a", "x": 1.5, "y": 0.5}])
    with pytest.raises(ValidationError):
        SessionRequest(points=[{"id": "a", "x": 0.5, "y": -0.1}])


def test_duplicate_ids_rejected():
    with pytest.raises(ValidationError):
        SessionRequest(
            points=[
                {"id": "a", "x": 0.1, "y": 0.1},
                {"id": "a", "x": 0.2, "y": 0.2},
            ]
        )


def test_empty_id_rejected():
    with pytest.raises(ValidationError):
        SessionRequest(points=[{"id": "", "x": 0.1, "y": 0.1}])
