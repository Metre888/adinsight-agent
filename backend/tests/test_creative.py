import asyncio
from io import BytesIO
import json
from types import SimpleNamespace
from uuid import uuid4
from zipfile import ZipFile
from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError
from creative_models import CreativeOrder, GenerateAd, CreativePlan
from creative_api import create_router
from services.creative_service import CreativeService, fallback_plan
from services.creative_library import search_creatives, get_creative
from services.image_providers import render_layout, provider_catalog, validate_image, generate_image
from services.llm_service import DeepSeekLLM
from services.measurement import sample_performance
from services.workflow import Workflow
from models import BriefRequest

ORDER = dict(product_name="LumaSnap AI", product_type="AI 相机 App", target_region="泰国",
             target_users="成年内容创作者", marketing_goal="提高试用完成率", route="library", material_id="creative-camera-proof")


def setup(tmp_path, monkeypatch):
    for key in ("DEEPSEEK_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    llm = DeepSeekLLM()
    workflow = Workflow(llm, tmp_path / "runs")
    return CreativeService(llm, workflow, tmp_path / "creative")


def order(**kw):
    return CreativeOrder(**{**ORDER, **kw}).model_dump(mode="json")


def payload(plan, **kw):
    return GenerateAd(request_id=uuid4(), provider="mock", content=plan["content"],
                      content_approved=True, **kw).model_dump(mode="json")


def test_material_filter_and_asset_integrity():
    assert len(search_creatives("AI 相机 App", "泰国")["items"]) == 2
    assert not search_creatives("语言学习 App", "泰国")["items"]
    assert not search_creatives("医疗器械", "日本")["items"]
    assert len(search_creatives(query="文案优先")["items"]) == 3
    with pytest.raises(ValueError):
        get_creative("../../.env")
    for item in search_creatives()["items"]:
        raw = render_layout(order(), fallback_plan(order(), item), item)
        image = Image.open(BytesIO(raw))
        assert image.size == (1024, 1280)
        assert len(image.getcolors(image.width * image.height)) > 100


def test_input_and_copy_limits():
    with pytest.raises(ValidationError):
        CreativeOrder(**{**ORDER, "product_name": " "})
    with pytest.raises(ValidationError):
        CreativeOrder(**{**ORDER, "aspect_ratio": "evil"})
    maximal = order(constraints="a"*2000)
    CreativePlan.model_validate(fallback_plan(maximal, get_creative(ORDER["material_id"]), feedback="修订"*1000))
    with pytest.raises(ValidationError):
        GenerateAd(request_id=uuid4(), provider="mock", content=fallback_plan(order(), None), content_approved=False)


def test_real_mcp_creative_and_complete_closed_loop(tmp_path, monkeypatch):
    async def check():
        service = setup(tmp_path, monkeypatch)
        b = BriefRequest(product_name=ORDER["product_name"], product_type=ORDER["product_type"],
                         target_region=ORDER["target_region"], target_users=ORDER["target_users"],
                         marketing_goal=ORDER["marketing_goal"])
        run = service.workflow.create(b.model_dump())
        await service.workflow.tasks[run["id"]]
        with pytest.raises(ValueError):
            await service.plan(order(source_run_id=run["id"]))
        service.workflow.approve(run["id"], {"direction_id":"proof", "acknowledged":True, "feedback":"保持真实产品场景"})
        await service.workflow.tasks[run["id"]]
        plan = await service.plan(order(source_run_id=run["id"]))
        assert plan["brief_context"] == run["campaign_brief"]
        assert [t["name"] for t in plan["tool_calls"]] == ["search_creatives", "get_creative"]
        assert all(t["status"] == "completed" and t["transport"] == "stdio / MCP" for t in plan["tool_calls"])
        submitted = payload(plan)
        submitted["content"]["headline"] = "A customer-approved headline"
        job = service.create_job(plan["id"], submitted)
        assert service.create_job(plan["id"], submitted) is job
        submitted["content"]["headline"] = "Changed after submission"
        assert job["content"]["headline"] == "A customer-approved headline"
        with pytest.raises(ValueError):
            service.create_job(plan["id"], submitted)
        with pytest.raises(ValueError):
            service.approve(job["id"])
        await service.tasks[job["id"]]
        assert job["status"] == "succeeded", job
        assert job["dimensions"] == [1024,1280] and job["is_mock"]
        with pytest.raises(ValueError):
            await service.review(job["id"], {"metrics":sample_performance()["metrics"], "notes":""})
        service.approve(job["id"])
        await service.review(job["id"], {"metrics":sample_performance()["metrics"], "notes":"保留当前构图"})
        assert job["review"]["values"]["CTR"] == 1.9
        assert len(job["review"]["tool_calls"]) == 2
        with pytest.raises(ValueError):
            await service.review(job["id"], {"metrics":sample_performance()["metrics"], "notes":""})
        next_plan = await service.iterate(job["id"], "仅改 CTA")
        assert next_plan["version"] == 2 and next_plan["parent_job_id"] == job["id"]
        assert next_plan["review_context"]["values"]["CTR"] == 1.9
        assert next_plan["source_run_id"] == run["id"]
        assert "仅改 CTA" in next_plan["content"]["prompt"]
        assert next_plan["content"]["headline"] == job["content"]["headline"]
        assert next_plan["content"]["body"] != job["content"]["body"]
        assert "保留当前构图" in next_plan["revision_feedback"]
        with ZipFile(BytesIO(service.bundle(job["id"]))) as z:
            assert set(z.namelist()) == {"advertisement.png","creative-brief.json","generation-prompt.txt","storyboard.json","DELIVERY-NOTES.txt"}
            manifest=json.loads(z.read("creative-brief.json"))
            assert "tool_calls" not in manifest["review"]
            assert manifest["approval"]["acknowledged"]
        restored = CreativeService(service.llm, service.workflow, service.directory)
        assert restored.get_job(job["id"])["approval"] and restored.get_plan(next_plan["id"])["parent_job_id"] == job["id"]
        await service.close()
        await service.workflow.close()
    asyncio.run(check())


def test_provider_guard_and_failure_no_fake_fallback(tmp_path, monkeypatch):
    async def check():
        s=setup(tmp_path, monkeypatch)
        p=await s.plan(order(route="prompt", material_id=None))
        assert not p["tool_calls"] and p["material"] is None
        data=payload(p)
        data["provider"]="openai"
        with pytest.raises(ValueError, match="明确同意"):
            s.create_job(p["id"],data)
        data["external_consent"]=True
        with pytest.raises(ValueError, match="密钥"):
            s.create_job(p["id"],data)
        monkeypatch.setenv("OPENAI_API_KEY","test-key")
        failed=AsyncMock(side_effect=TimeoutError("sensitive-key-do-not-leak"))
        monkeypatch.setattr("services.creative_service.generate_image",failed)
        j=s.create_job(p["id"],data)
        await s.tasks[j["id"]]
        assert j["status"]=="failed" and j["is_mock"] is False
        assert failed.await_count==1 and "sensitive" not in json.dumps(j)
        assert not (s.directory/(j["id"]+".png")).exists()
        assert s.create_job(p["id"],data) is j and failed.await_count==1
        with pytest.raises(ValueError):
            s.bundle(j["id"])
        await s.close()
        await s.workflow.close()
    asyncio.run(check())


def test_image_validation_and_sizes():
    for ratio, size in [("1:1",(1024,1024)),("4:5",(1024,1280)),("9:16",(864,1536))]:
        o=order(aspect_ratio=ratio, route="prompt", material_id=None, language="简体中文")
        c=fallback_plan(o,None)
        c["headline"]="广告标题"*20
        raw=render_layout(o,c)
        assert tuple(validate_image(raw)[1])==size
    with pytest.raises(Exception):
        validate_image(b"not an image")


def test_api_contract_and_mismatch(tmp_path, monkeypatch):
    s=setup(tmp_path, monkeypatch)
    app=FastAPI()
    app.include_router(create_router(s))
    with TestClient(app) as c:
        assert len(c.get("/api/creative/providers").json()["items"])==3
        assert all(not p["configured"] for p in c.get("/api/creative/providers").json()["items"] if p["external"])
        assert c.post("/api/creative/plans",json={}).status_code==422
        assert c.get("/api/creative/jobs/unknown").status_code==404
        assert c.get("/api/creative/materials/unknown/image").status_code==409
        assert c.post("/api/creative/plans",json=order(route="prompt")).status_code==409
        p=c.post("/api/creative/plans",json=order(route="prompt",material_id=None)).json()
        assert p["mode"]["mode"]=="mock"
        data=payload(p)
        data["provider"]="google"
        assert c.post(f'/api/creative/plans/{p["id"]}/generate',json=data).status_code==409
        data["content_approved"]=False
        assert c.post(f'/api/creative/plans/{p["id"]}/generate',json=data).status_code==422


def test_external_provider_payloads_are_reference_aware(monkeypatch):
    import base64
    o=order()
    material=get_creative(o["material_id"])
    c=fallback_plan(o,material)
    raw=render_layout(o,c,material)
    encoded=base64.b64encode(raw).decode()
    calls=[]
    class FakeOpenAI:
        def __init__(self,**kwargs):
            self.images=SimpleNamespace(generate=AsyncMock(return_value=SimpleNamespace(data=[SimpleNamespace(b64_json=encoded)])),
                                       edit=AsyncMock(return_value=SimpleNamespace(data=[SimpleNamespace(b64_json=encoded)])))
            calls.append(self)
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
    class FakeHTTP:
        def __init__(self,**kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def post(self,url,**kwargs):
            calls.append((url,kwargs))
            return SimpleNamespace(raise_for_status=lambda:None,json=lambda:{"steps":[{"type":"model_output","content":[{"type":"image","data":encoded}]}]})
    monkeypatch.setenv("OPENAI_API_KEY","fake-openai")
    monkeypatch.setenv("GEMINI_API_KEY","fake-google")
    monkeypatch.setattr("services.image_providers.AsyncOpenAI",FakeOpenAI)
    monkeypatch.setattr("services.image_providers.httpx.AsyncClient",FakeHTTP)
    async def check():
        assert await generate_image("openai",o,c,material)==raw
        request=calls[-1].images.edit.call_args.kwargs
        assert request["model"]=="gpt-image-2" and request["size"]=="1024x1280"
        assert len(request["image"][1])>1000 and "Headline (exact)" in request["prompt"]
        await generate_image("openai",o,c,None)
        calls[-1].images.generate.assert_awaited_once()
        assert await generate_image("google",o,c,material)==raw
        url, request=calls[-1]
        assert url=="https://generativelanguage.googleapis.com/v1beta/interactions"
        assert request["json"]["input"][1]["type"]=="image"
        assert request["json"]["response_format"]["aspect_ratio"]=="4:5"
        assert request["json"]["store"] is False
    asyncio.run(check())


def test_interrupted_jobs_are_not_retried(tmp_path,monkeypatch):
    async def check():
        s=setup(tmp_path,monkeypatch)
        p=await s.plan(order(route="prompt",material_id=None))
        monkeypatch.setattr("services.creative_service.generate_image",AsyncMock(side_effect=lambda *args: asyncio.sleep(20)))
        # Save a queued snapshot to mimic a hard process stop, without invoking a provider.
        ident=str(uuid4())
        s.save({"kind":"job","id":ident,"status":"running"})
        restored=CreativeService(s.llm,s.workflow,s.directory)
        assert restored.get_job(ident)["status"]=="interrupted"
        assert not restored.tasks
        await s.close()
        await s.workflow.close()
    asyncio.run(check())
