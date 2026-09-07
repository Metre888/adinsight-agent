import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from models import BriefRequest, Measurements, Research
from agents.rag_retriever import KnowledgeRetriever
from services.measurement import calculate_metrics, sample_performance, plan_experiment
from services.llm_service import DeepSeekLLM
from services.workflow import Workflow, export_markdown
from services.mcp_gateway import ToolGateway


BRIEF = dict(product_name="LumaSnap AI", product_type="AI 相机 App", target_region="泰国",
             target_users="年轻内容创作者", marketing_goal="提高试用完成率", platforms="TikTok",
             budget_range="$8000", current_challenges="CVR 偏低")


def mock_llm(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    return DeepSeekLLM()


def test_metrics_math_and_zero():
    low = calculate_metrics(sample_performance()["metrics"])
    good = calculate_metrics(sample_performance("healthy")["metrics"])
    empty = calculate_metrics(sample_performance("empty")["metrics"])
    assert low["values"]["CTR"] == 1.9
    assert low["values"]["CPA"] == 12.8
    assert low["values"]["creative_adoption_rate"] == 41.6667
    assert {i["metric"] for i in low["abnormal_metrics"]} == {"CVR", "ROAS", "creative_adoption_rate"}
    assert not good["abnormal_metrics"]
    assert all(v is None for v in empty["values"].values())
    assert plan_experiment(0)["status"] == "insufficient_data"
    assert plan_experiment(.06)["sample_per_variant"] > 1000


def test_bad_input():
    with pytest.raises(ValidationError):
        BriefRequest(**{**BRIEF, "product_name": " "})
    with pytest.raises(ValidationError):
        Measurements(**{**sample_performance()["metrics"], "clicks": 1})
    with pytest.raises(ValidationError):
        Measurements(**{**sample_performance()["metrics"], "spend": float("inf")})


def test_retrieval_filters():
    r = KnowledgeRetriever()
    sources = r.search("AI 相机 App", "泰国", limit=8)
    assert {s["id"] for s in sources} == {"mk-001", "cc-001", "cp-001", "rv-001"}
    assert all(s["is_mock"] for s in sources)
    assert r.search("医疗器械", "日本") == []
    assert r.search("语言学习 App", "印尼") == []
    assert r.search("语言学习 App", "美国")[0]["id"] in {"mk-002", "cc-002", "cp-002"}


def test_mcp_discovery_and_whitelist():
    async def check():
        gateway = ToolGateway()
        info = await gateway.describe("measurement")
        assert info["status"] == "connected"
        assert {t["name"] for t in info["tools"]} == {"sample_performance", "calculate_metrics", "plan_experiment"}
        assert all(t["inputSchema"]["type"] == "object" for t in info["tools"])
        async def forbidden(call, definitions):
            await call("sample_performance", {})
        with pytest.raises(ExceptionGroup):
            await gateway.session("measurement", "market", lambda e: None, forbidden)
    asyncio.run(check())


def test_complete_run_with_human_gate(tmp_path, monkeypatch):
    async def check():
        w = Workflow(mock_llm(monkeypatch), tmp_path)
        run = w.create(BriefRequest(**BRIEF).model_dump())
        await w.tasks[run["id"]]
        assert run["status"] == "awaiting_approval", run.get("error")
        assert run["campaign_brief"] is None
        assert len(run["tool_calls"]) == 6
        with pytest.raises(ValueError):
            export_markdown(run)
        w.approve(run["id"], {"direction_id": "local", "feedback": "只测试印尼", "acknowledged": True})
        with pytest.raises(ValueError):
            w.approve(run["id"], {})
        await w.tasks[run["id"]]
        assert run["status"] == "completed", run.get("error")
        assert "只测试印尼" in run["campaign_brief"]["creative_direction"]
        assert len(run["sources"]) == 4
        assert len(run["tool_calls"]) == 7
        calculation_trace = next(t for t in run["tool_calls"] if t["name"] == "calculate_metrics")
        assert "historical_context" not in calculation_trace["result"]
        assert all(t["transport"] == "stdio / MCP" for t in run["tool_calls"])
        assert all(s["status"] == "completed" for s in run["steps"])
        # Parallel branches overlap; this is real execution timing, not fake progress.
        market, competitor = run["steps"][1:3]
        assert market["started_at"] < competitor["ended_at"]
        assert competitor["started_at"] < market["ended_at"]
        exported = export_markdown(run)
        assert "合成业务数据" in exported and "核心指标" in exported
        assert str(run["experiment"]["sample_per_variant"]) in exported
        assert json.loads((tmp_path / (run["id"] + ".json")).read_text())["status"] == "completed"
        w.delete(run["id"])
        assert not w.runs
        await w.close()
    asyncio.run(check())


def test_cancel_and_recovery(tmp_path, monkeypatch):
    async def check():
        w = Workflow(mock_llm(monkeypatch), tmp_path)
        run = w.create(BriefRequest(**BRIEF).model_dump())
        await asyncio.sleep(.02)
        await w.cancel(run["id"])
        assert run["status"] == "cancelled"
        assert run["campaign_brief"] is None
        run["status"] = "researching"
        w.commit(run)
        restored = Workflow(mock_llm(monkeypatch), tmp_path)
        assert restored.get(run["id"])["status"] == "interrupted"
        await w.close()
        await restored.close()
    asyncio.run(check())


def test_llm_fallback_validation(monkeypatch):
    fallback = {"headline": "合成分析", "findings": [{"title": "测试", "detail": "待验证", "source_ids": []}], "risks": ["合成数据"]}
    async def check():
        llm = mock_llm(monkeypatch)
        llm.client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock())))
        llm.client.chat.completions.create.side_effect = TimeoutError()
        result, meta = await llm.generate("test", {}, Research, fallback)
        assert result == fallback and meta["mode"] == "fallback"
        llm.client.chat.completions.create.side_effect = None
        llm.client.chat.completions.create.return_value = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"unexpected": true}'))], usage=None)
        _, meta = await llm.generate("test", {}, Research, fallback)
        assert meta["mode"] == "fallback"
        invalid = {**fallback, "findings": [{"title": "测试", "detail": "待验证", "source_ids": ["invented"]}]}
        llm.client.chat.completions.create.return_value.choices[0].message.content = json.dumps(invalid)
        _, meta = await llm.generate("test", {}, Research, fallback)
        assert meta["mode"] == "fallback"
    asyncio.run(check())


def test_api_contract(tmp_path, monkeypatch):
    import main
    monkeypatch.setattr(main, "workflow", Workflow(mock_llm(monkeypatch), tmp_path))
    with TestClient(main.app) as c:
        assert c.get("/api/health").status_code == 200
        assert c.post("/api/runs", json={}).status_code == 422
        assert c.get("/api/runs/not-found").status_code == 404
        assert c.post("/api/review", json={"scenario": "empty"}).json()["values"]["CPA"] is None
        result = c.post("/api/analyze", json=BRIEF).json()
        assert result["requires_approval"] and result["status"] == "awaiting_approval"
        run_id = result["run_id"]
        assert c.get(f"/api/runs/{run_id}/export").status_code == 409
        assert c.post(f"/api/runs/{run_id}/approve", json={"direction_id":"proof","acknowledged":False}).status_code == 422
        with c.stream("GET", f"/api/runs/{run_id}/events") as response:
            assert "event: snapshot" in "".join(response.iter_text())
        assert c.post(f"/api/runs/{run_id}/cancel").json()["status"] == "cancelled"
        assert c.delete(f"/api/runs/{run_id}").status_code == 200
