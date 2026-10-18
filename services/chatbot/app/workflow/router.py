from dotenv import load_dotenv
import os

load_dotenv()

from .shared.providers import create_llm
from .shared.prompts import ROUTER_SYSTEM_PROMPT
from .state import RouterOutput, GraphState

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder


llm_name = os.getenv("LLM_NAME")
llm = create_llm(llm_name)

router_prompt = ChatPromptTemplate.from_messages([
    ("system", ROUTER_SYSTEM_PROMPT),
    MessagesPlaceholder(
        variable_name="chat_history",
        optional=True,
        n_messages=6
    ),

])

router_chain = router_prompt | llm.with_structured_output(RouterOutput) 

def router_node(state: GraphState):
    if state.get("support_mode") == "hint" and state.get("assignment_context"):
        return {"intent": "hints"}
    messages = state["messages"]
    result = router_chain.invoke({"chat_history": messages})

    return {"intent": result.intent}
