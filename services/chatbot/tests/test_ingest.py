from unittest.mock import MagicMock
from uuid import uuid4

import httpx
import openai
import pytest

from app.services.ingest import Ingestion, VLMUnavailableError


def _ingestion_with_cursor():
    """Ingestion với pool giả để test SQL mà không cần PostgreSQL."""
    ingestion = Ingestion.__new__(Ingestion)

    cursor = MagicMock()
    conn = MagicMock()
    conn.__enter__.return_value = conn
    conn.cursor.return_value.__enter__.return_value = cursor

    pool = MagicMock()
    pool.connection.return_value = conn

    ingestion._pool = pool
    return ingestion, cursor


def test_load_slide_queries_by_id():
    ingestion, cursor = _ingestion_with_cursor()
    slide_id = str(uuid4())
    cursor.fetchone.return_value = {"id": slide_id}

    assert ingestion._load_slide(slide_id) == {"id": slide_id}

    query, params = cursor.execute.call_args.args
    assert "WHERE lc.id = %s" in query
    assert params == (slide_id,)


def test_embed_new_raises_lookup_error_when_slide_missing():
    ingestion, cursor = _ingestion_with_cursor()
    cursor.fetchone.return_value = None

    with pytest.raises(LookupError):
        ingestion.embed_new(str(uuid4()))


def test_embed_new_embeds_single_slide():
    ingestion, cursor = _ingestion_with_cursor()
    slide_id = str(uuid4())
    cursor.fetchone.return_value = {"id": slide_id}
    ingestion._embed_batch = MagicMock(return_value=(1, 0))

    assert ingestion.embed_new(slide_id) == (1, 0)
    ingestion._embed_batch.assert_called_once_with([{"id": slide_id}])


def test_verify_vector_dim_accepts_matching_column():
    ingestion, cursor = _ingestion_with_cursor()
    cursor.fetchone.return_value = (Ingestion.VECTOR_DIM,)

    ingestion._verify_vector_dim()  # không raise


def test_verify_vector_dim_accepts_dict_row():
    ingestion, cursor = _ingestion_with_cursor()
    cursor.fetchone.return_value = {"atttypmod": Ingestion.VECTOR_DIM}

    ingestion._verify_vector_dim()  # không raise


def test_verify_vector_dim_rejects_mismatch(monkeypatch):
    ingestion, cursor = _ingestion_with_cursor()
    cursor.fetchone.return_value = (1024,)
    monkeypatch.setattr(Ingestion, "VECTOR_DIM", 4096)

    with pytest.raises(RuntimeError, match=r"không khớp VECTOR\(1024\)"):
        ingestion._verify_vector_dim()


def test_verify_vector_dim_reports_missing_migration():
    ingestion, cursor = _ingestion_with_cursor()
    cursor.fetchone.return_value = None

    with pytest.raises(RuntimeError, match="migration 011"):
        ingestion._verify_vector_dim()


def _slide():
    return {
        "id": str(uuid4()),
        "image_url": "lessons/x.png",
        "course_title": "Course",
        "module_title": "Module",
        "lesson_title": "Lesson",
    }


def test_embed_batch_skips_failing_slide_without_failing_batch():
    ingestion, _ = _ingestion_with_cursor()
    ingestion._load_image = MagicMock(side_effect=ValueError("ảnh hỏng"))
    ingestion._describe_image = MagicMock()
    ingestion.embedding = MagicMock()

    processed, failed = ingestion._embed_batch([_slide()])

    assert (processed, failed) == (0, 1)
    ingestion._describe_image.assert_not_called()
    ingestion.embedding.embed_documents.assert_not_called()


def test_embed_batch_propagates_vlm_unavailable():
    ingestion, _ = _ingestion_with_cursor()
    ingestion._load_image = MagicMock(return_value="b64")
    ingestion._describe_image = MagicMock(side_effect=VLMUnavailableError("down"))
    ingestion.embedding = MagicMock()

    with pytest.raises(VLMUnavailableError):
        ingestion._embed_batch([_slide()])


def _api_request() -> httpx.Request:
    return httpx.Request("POST", "https://api.river.ai/v1/chat/completions")


def test_describe_image_maps_connect_error_to_vlm_unavailable():
    """River AI không kết nối được -> VLMUnavailableError (503)."""
    ingestion = Ingestion.__new__(Ingestion)
    ingestion.slide_to_text_chain = MagicMock()
    ingestion.slide_to_text_chain.invoke.side_effect = openai.APIConnectionError(
        request=_api_request()
    )

    with pytest.raises(VLMUnavailableError, match="Không kết nối được VLM"):
        ingestion._describe_image("b64")


def test_describe_image_maps_timeout_to_vlm_unavailable():
    ingestion = Ingestion.__new__(Ingestion)
    ingestion.slide_to_text_chain = MagicMock()
    ingestion.slide_to_text_chain.invoke.side_effect = openai.APITimeoutError(
        request=_api_request()
    )

    with pytest.raises(VLMUnavailableError, match="không phản hồi"):
        ingestion._describe_image("b64")


def test_describe_image_maps_server_error_to_vlm_unavailable():
    """5xx/429 là lỗi tạm thời -> 503 để backend retry."""
    ingestion = Ingestion.__new__(Ingestion)
    ingestion.slide_to_text_chain = MagicMock()
    ingestion.slide_to_text_chain.invoke.side_effect = openai.APIStatusError(
        "server error",
        response=httpx.Response(503, request=_api_request()),
        body=None,
    )

    with pytest.raises(VLMUnavailableError, match="tạm thời không khả dụng"):
        ingestion._describe_image("b64")


def test_describe_image_propagates_client_error():
    """4xx (vd 401 sai key) KHÔNG phải lỗi tạm thời -> để slide bị đánh dấu failed."""
    ingestion = Ingestion.__new__(Ingestion)
    ingestion.slide_to_text_chain = MagicMock()
    ingestion.slide_to_text_chain.invoke.side_effect = openai.APIStatusError(
        "unauthorized",
        response=httpx.Response(401, request=_api_request()),
        body=None,
    )

    with pytest.raises(openai.APIStatusError):
        ingestion._describe_image("b64")
