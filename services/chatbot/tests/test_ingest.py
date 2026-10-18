from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.services.ingest import Ingestion


def _ingestion_with_cursor():
    """Ingestion với conn giả để test SQL mà không cần PostgreSQL."""
    ingestion = Ingestion.__new__(Ingestion)
    ingestion.conn = MagicMock()
    cursor = ingestion.conn.cursor.return_value.__enter__.return_value
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
    ingestion._embed_batch = MagicMock(return_value=1)

    assert ingestion.embed_new(slide_id) == 1
    ingestion._embed_batch.assert_called_once_with([{"id": slide_id}])


def test_verify_vector_dim_accepts_matching_column():
    ingestion, cursor = _ingestion_with_cursor()
    cursor.fetchone.return_value = (Ingestion.VECTOR_DIM,)

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
