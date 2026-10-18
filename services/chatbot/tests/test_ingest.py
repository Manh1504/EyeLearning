from unittest.mock import MagicMock
from uuid import uuid4

from app.services.ingest import Ingestion


def test_load_slides_first_page_has_no_numeric_cursor():
    ingestion = Ingestion.__new__(Ingestion)
    ingestion.conn = MagicMock()
    cursor = ingestion.conn.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = []
    course_id = str(uuid4())

    assert ingestion._load_slides(course_id, None, 20) == []

    query, params = cursor.execute.call_args.args
    assert "lc.id > %s" not in query
    assert params == (course_id, 20)


def test_embed_existing_uses_uuid_keyset_cursor():
    ingestion = Ingestion.__new__(Ingestion)
    course_id = str(uuid4())
    first_id = str(uuid4())
    second_id = str(uuid4())
    ingestion._load_slides = MagicMock(
        side_effect=[[{"id": first_id}], [{"id": second_id}], []]
    )
    ingestion._embed_batch = MagicMock(return_value=1)

    assert ingestion.embed_existing(course_id, batch_size=1) == 2
    assert ingestion._load_slides.call_args_list[0].args == (course_id, None, 1)
    assert ingestion._load_slides.call_args_list[1].args == (course_id, first_id, 1)
    assert ingestion._load_slides.call_args_list[2].args == (course_id, second_id, 1)
