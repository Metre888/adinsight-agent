import asyncio
import copy
import json
import os
from pathlib import Path
import sys
import time
from mcp import Client, StdioServerParameters

ROOT = Path(__file__).resolve().parents[1]
POLICY = {
    "creative": {"search_creatives", "get_creative"},
    "market": {"search_knowledge"}, "competitor": {"search_knowledge"},
    "review": {"search_knowledge", "sample_performance", "calculate_metrics", "plan_experiment"},
    "campaign": {"search_knowledge"}, "catalog": {"knowledge_catalog"},
}


class ToolGateway:
    async def session(self, server, agent, callback, work):
        # A branch owns its process and session; cancellation closes them in the same task.
        env = {k: v for k, v in os.environ.items() if k in {"PATH", "HOME", "TMPDIR", "SYSTEMROOT", "LANG"}}
        params = StdioServerParameters(command=sys.executable, args=[str(ROOT / "mcp_server.py"), server], cwd=ROOT, env=env)
        async with asyncio.timeout(45):
            async with Client(params, read_timeout_seconds=20) as client:
                listing = await client.list_tools()
                definitions = {t.name: t.model_dump(by_alias=True, mode="json") for t in listing.tools}

                async def call(name, arguments):
                    if name not in POLICY.get(agent, set()) or name not in definitions:
                        raise PermissionError("工具不在当前 Agent 的白名单中")
                    entry = {"id": f"tool-{time.time_ns()}", "server": server, "agent": agent,
                             "name": name, "arguments": arguments, "transport": "stdio / MCP",
                             "status": "running", "started_at": time.time()}
                    callback(entry.copy())
                    start = time.monotonic()
                    try:
                        response = await client.call_tool(name, arguments)
                        if response.is_error:
                            raise RuntimeError("MCP tool returned an error")
                        data = response.structured_content
                        if data is None:
                            data = json.loads(next(c.text for c in response.content if c.type == "text"))
                        entry.update(status="completed", result=copy.deepcopy(data))
                        return data
                    except BaseException:
                        entry.update(status="failed", error="工具执行失败或任务已取消")
                        raise
                    finally:
                        entry["duration_ms"] = round((time.monotonic() - start) * 1000)
                        callback(entry.copy())

                return await work(call, list(definitions.values()))

    async def describe(self, server):
        async def work(call, definitions):
            return {"server": server, "status": "connected", "transport": "stdio / MCP", "tools": definitions}
        try:
            return await self.session(server, "catalog" if server == "knowledge" else "review", lambda e: None, work)
        except Exception:
            return {"server": server, "status": "unavailable", "transport": "stdio / MCP", "tools": []}
