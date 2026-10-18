from workflow.graph import build_graph
graph = build_graph()
png = build_graph().get_graph().draw_mermaid_png()
open("graph.png", "wb").write(png)