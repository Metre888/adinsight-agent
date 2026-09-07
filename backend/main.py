import asyncio
from contextlib import asynccontextmanager
import json
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from models import BriefRequest, Approval, Measurements
from agents.rag_retriever import KnowledgeRetriever
from agents.review_agent import generate_review
from services.llm_service import DeepSeekLLM
from services.workflow import Workflow, ACTIVE, export_markdown
from services.creative_service import CreativeService
from creative_api import create_router

llm = DeepSeekLLM()
workflow = Workflow(llm)
creative = CreativeService(llm, workflow)
retriever = KnowledgeRetriever()


@asynccontextmanager
async def lifespan(app):
    yield
    await creative.close()
    await workflow.close()


app = FastAPI(title="AdInsight Agent", version="0.3.0", lifespan=lifespan)
app.include_router(create_router(creative))
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:8000", "http://127.0.0.1:8000"], allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"])


def get_run(run_id):
    try:
        return workflow.get(run_id)
    except KeyError:
        raise HTTPException(404, "任务不存在")


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": llm.mode, "model": llm.model if llm.mode == "deepseek" else None,
            "version": "0.3.0", "data_mode": "mock"}


@app.get("/api/knowledge")
def knowledge():
    return retriever.get_summary()


@app.get("/api/integrations")
async def integrations():
    results = await asyncio.gather(workflow.gateway.describe("knowledge"), workflow.gateway.describe("measurement"), workflow.gateway.describe("creative"))
    return {"servers": results, "policy": "local_read_only", "external_ad_accounts": False}


@app.get("/api/runs")
def list_runs():
    return [{"id": r["id"], "product_name": r["brief"]["product_name"], "status": r["status"],
             "created_at": r["created_at"]} for r in sorted(workflow.runs.values(), key=lambda x: x["created_at"], reverse=True)]


@app.post("/api/runs", status_code=202)
async def create_run_async(brief: BriefRequest):
    try:
        return workflow.create(brief.model_dump())
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@app.get("/api/runs/{run_id}")
def read_run(run_id: str):
    return get_run(run_id)


@app.post("/api/runs/{run_id}/approve")
async def approve(run_id: str, approval: Approval):
    get_run(run_id)
    try:
        return workflow.approve(run_id, approval.model_dump())
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@app.post("/api/runs/{run_id}/cancel")
async def cancel(run_id: str):
    get_run(run_id)
    return await workflow.cancel(run_id)


@app.delete("/api/runs/{run_id}")
def delete(run_id: str):
    get_run(run_id)
    try:
        workflow.delete(run_id)
        return {"deleted": True}
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@app.get("/api/runs/{run_id}/events")
async def events(run_id: str):
    get_run(run_id)
    async def stream():
        revision = -1
        while True:
            run = get_run(run_id)
            if revision != run["revision"]:
                revision = run["revision"]
                yield f"id: {revision}\nevent: snapshot\ndata: {json.dumps(run, ensure_ascii=False)}\n\n"
            if run["status"] not in ACTIVE:
                break
            yield ": heartbeat\n\n"
            await asyncio.sleep(.35)
    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/runs/{run_id}/export")
def export(run_id: str):
    try:
        return PlainTextResponse(export_markdown(get_run(run_id)),
            headers={"Content-Disposition": 'attachment; filename="campaign-brief.md"'})
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@app.post("/api/analyze")
async def analyze(brief: BriefRequest):
    try:
        run = workflow.create(brief.model_dump())
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    await workflow.tasks[run["id"]]
    return {"run_id": run["id"], "status": run["status"], "requires_approval": True,
            "brief_parse_result": run.get("parse", {}), "market_insight": run["research"].get("market", {}),
            "competitor_analysis": run["research"].get("competitor", {}), "campaign_brief": {},
            "retrieved_sources": run["sources"], "agent_steps": run["steps"]}


class ReviewRequest(BaseModel):
    metrics: Measurements | None = None
    scenario: Literal["leaky", "healthy", "empty"] = "leaky"
    product_name: str = ""
    campaign_name: str = ""


@app.post("/api/review")
def review(payload: ReviewRequest):
    data = generate_review(payload.metrics.model_dump() if payload.metrics else None, payload.scenario)
    return {**data, "performance_summary": {"summary": data["summary"], "metrics": data["values"]},
            "next_test_plan": data["experiment"],
            "next_campaign_adjustment": {"suggestions": data["optimization_suggestions"]}}


DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if (DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/")
def frontend():
    if (DIST / "index.html").exists():
        return FileResponse(DIST / "index.html")
    return {"message": "前端尚未构建，请在 frontend 执行 npm run build，或访问 Vite 开发服务。"}
