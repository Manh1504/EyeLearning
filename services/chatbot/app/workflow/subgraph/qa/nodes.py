"""Node trả lời cho intent qa (giải thích kiến thức, không giải bài tập)."""

from ...shared.prompts import QA_SYSTEM_PROMPT
from ..common import build_answer_node

answer_node = build_answer_node(QA_SYSTEM_PROMPT)
