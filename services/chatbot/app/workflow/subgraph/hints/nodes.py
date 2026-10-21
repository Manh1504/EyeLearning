"""Node trả lời cho intent hints (hướng dẫn từng bước, không giải hộ)."""

from ...shared.prompts import HINTS_SYSTEM_PROMPT
from ..common import build_answer_node

answer_node = build_answer_node(HINTS_SYSTEM_PROMPT)
