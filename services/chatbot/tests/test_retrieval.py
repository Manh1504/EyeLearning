from unittest.mock import MagicMock
from uuid import uuid4

from app.workflow.shared.retrieval import Retriever, build_citations


def test_search_empty_embedding_table_returns_empty():
    retriever = Retriever.__new__(Retriever)
    retriever.embedding = MagicMock()
    retriever.embedding.embed_query.return_value = [0.1, 0.2]
    retriever.top_k = 5
    retriever.threshold = 0.3
    retriever.conn = MagicMock()
    cursor = retriever.conn.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = []

    assert retriever.search("question", str(uuid4())) == []
    retriever.embedding.embed_query.assert_called_once_with("question")


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
