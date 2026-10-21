import pytest

from app import settings


def _set_valid_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/db")
    monkeypatch.setenv("LLM_NAME", "river")
    monkeypatch.setenv("EMBEDDING_NAME", "local")
    monkeypatch.setenv("VLM_NAME", "river")
    monkeypatch.setenv("RIVER_API_KEY", "rv_test")


def test_validate_accepts_valid_config(monkeypatch):
    _set_valid_env(monkeypatch)
    settings.validate()  # không raise


def test_validate_rejects_bad_llm(monkeypatch):
    _set_valid_env(monkeypatch)
    monkeypatch.setenv("LLM_NAME", "gpt")
    with pytest.raises(RuntimeError, match="LLM_NAME"):
        settings.validate()


def test_validate_rejects_bad_embedding(monkeypatch):
    _set_valid_env(monkeypatch)
    monkeypatch.setenv("EMBEDDING_NAME", "magic")
    with pytest.raises(RuntimeError, match="EMBEDDING_NAME"):
        settings.validate()


def test_validate_rejects_bad_vlm(monkeypatch):
    _set_valid_env(monkeypatch)
    monkeypatch.setenv("VLM_NAME", "local")
    with pytest.raises(RuntimeError, match="VLM_NAME"):
        settings.validate()


def test_validate_rejects_missing_river_key(monkeypatch):
    _set_valid_env(monkeypatch)
    monkeypatch.delenv("RIVER_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="RIVER_API_KEY"):
        settings.validate()


def test_validate_rejects_missing_database(monkeypatch):
    _set_valid_env(monkeypatch)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL_DOCKER", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        settings.validate()
