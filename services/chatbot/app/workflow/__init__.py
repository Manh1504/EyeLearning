"""Package workflow: chứa graph LangGraph và các subgraph theo intent."""

from dotenv import load_dotenv

# Nạp .env ngay khi import package để mọi module con dùng được biến môi trường
# (LLM_NAME, EMBEDDING_NAME, DATABASE_URL, ...).
load_dotenv()
