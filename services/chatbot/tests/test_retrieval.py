from unittest.mock import MagicMock
from uuid import uuid4

from app.workflow.shared import retrieval as retrieval_mod
from app.workflow.shared.retrieval import Retriever, build_citations


def _retriever_with_fake_pool(monkeypatch, fetchall_result):
    retriever = Retriever.__new__(Retriever)
    retriever.embedding = MagicMock()
    retriever.embedding.embed_query.return_value = [0.1, 0.2]
    retriever.top_k = 5
    retriever.threshold = 0.3

    cursor = MagicMock()
    cursor.fetchall.return_value = fetchall_result

    conn = MagicMock()
    conn.__enter__.return_value = conn
    conn.cursor.return_value.__enter__.return_value = cursor

    pool = MagicMock()
    pool.connection.return_value = conn

    monkeypatch.setattr(retrieval_mod, "get_pool", lambda: pool)
    return retriever, cursor


def test_search_empty_embedding_table_returns_empty(monkeypatch):
    retriever, _ = _retriever_with_fake_pool(monkeypatch, [])

    assert retriever.search("question", str(uuid4())) == []
    retriever.embedding.embed_query.assert_called_once_with("question")


def test_search_returns_rows_as_dicts(monkeypatch):
    row = {"id": str(uuid4()), "content": "c", "score": 0.9}
    retriever, _ = _retriever_with_fake_pool(monkeypatch, [row])

    assert retriever.search("q", str(uuid4())) == [row]


def test_build_citations_preserves_uuid_as_string():
    document_id = str(uuid4())
    docs = [{
        "id": document_id,
        "content": "content",
        "course_title": "Course",
        "module_title": "Module",
        "lesson_title": "Lesson",
        "image_url": "https://example.test/slide.png",
        "score": 0.9,
    }]

    assert build_citations(docs)[0]["document_id"] == document_id


def test_search_forwards_lesson_id_and_falls_back_to_course(monkeypatch):
    lesson_id = str(uuid4())
    scoped = {"id": str(uuid4()), "content": "c", "score": 0.9}
    duplicated = {"id": scoped["id"], "content": "c", "score": 0.8}
    other = {"id": str(uuid4()), "content": "d", "score": 0.7}
    retriever, cursor = _retriever_with_fake_pool(monkeypatch, [scoped])
    # Lần 1 (theo bài) chỉ được 1 kết quả < top_k -> lần 2 nới ra toàn khóa.
    cursor.fetchall.side_effect = [[scoped], [duplicated, other]]

    result = retriever.search("q", str(uuid4()), lesson_id=lesson_id)

    # Gộp kết quả hai lần, không trùng slide, tối đa top_k.
    assert [doc["id"] for doc in result] == [scoped["id"], other["id"]]
    assert cursor.execute.call_count == 2
    scoped_params = cursor.execute.call_args_list[0][0][1]
    course_params = cursor.execute.call_args_list[1][0][1]
    assert scoped_params[2] == lesson_id
    assert course_params[2] is None


def test_search_scoped_never_falls_back_when_enough_rows(monkeypatch):
    rows = [{"id": str(uuid4()), "content": "c", "score": 0.9} for _ in range(5)]
    retriever, cursor = _retriever_with_fake_pool(monkeypatch, rows)

    result = retriever.search("q", str(uuid4()), lesson_id=str(uuid4()))

    assert len(result) == 5
    assert cursor.execute.call_count == 1


def test_search_without_lesson_id_queries_course_once(monkeypatch):
    retriever, cursor = _retriever_with_fake_pool(monkeypatch, [])

    assert retriever.search("q", str(uuid4())) == []
    assert cursor.execute.call_count == 1
    assert cursor.execute.call_args_list[0][0][1][2] is None
