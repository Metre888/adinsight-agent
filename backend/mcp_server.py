"""Read-only MCP servers. stdout is reserved for protocol messages."""
import sys
from mcp.server import MCPServer
from mcp_types import ToolAnnotations
from agents.rag_retriever import KnowledgeRetriever
from services.measurement import sample_performance, calculate_metrics, plan_experiment
from services.creative_library import search_creatives, get_creative


def create_server(kind: str):
    server = MCPServer(f"adinsight-{kind}", version="0.3.0")
    readonly = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)
    if kind == "knowledge":
        retriever = KnowledgeRetriever()

        @server.tool(annotations=readonly)
        def search_knowledge(product_type: str, region: str, query: str = "", collection: str = "all", limit: int = 4) -> dict:
            """Search synthetic marketing evidence, not live market facts."""
            sources = retriever.search(product_type, region, query, collection, limit)
            return {"sources": sources, "coverage": "matched" if sources else "no_evidence", "is_mock": True}

        @server.tool(annotations=readonly)
        def knowledge_catalog() -> dict:
            """List synthetic knowledge collections and coverage."""
            return retriever.get_summary()
    elif kind == "creative":
        server.tool(annotations=readonly)(search_creatives)
        server.tool(annotations=readonly)(get_creative)
    elif kind == "measurement":
        server.tool(annotations=readonly)(sample_performance)
        server.tool(annotations=readonly)(calculate_metrics)
        server.tool(annotations=readonly)(plan_experiment)
    else:
        raise ValueError("Unknown MCP server")
    return server


if __name__ == "__main__":
    create_server(sys.argv[1]).run(transport="stdio")
