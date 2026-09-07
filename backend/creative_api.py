import asyncio
import inspect
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response
from creative_models import CreativeOrder, GenerateAd, DeliveryApproval, CreativeReview, IterateAd
from services.creative_library import search_creatives, get_creative
from services.image_providers import provider_catalog, render_layout
from services.creative_service import fallback_plan


def create_router(service):
    router = APIRouter(prefix="/api/creative", tags=["Creative delivery"])

    async def invoke(fn, *args):
        try:
            result = fn(*args)
            return await result if inspect.isawaitable(result) else result
        except KeyError:
            raise HTTPException(404, "关联的研究、方案或广告版本不存在")
        except ValueError as exc:
            raise HTTPException(409, str(exc))
        except Exception:
            raise HTTPException(503, "创意服务暂不可用，未自动重试外部模型调用")

    @router.get("/providers")
    def providers():
        return {"items": provider_catalog(), "external_execution": "explicit_consent", "video": "prompt_and_storyboard_only"}

    @router.get("/materials")
    def materials(product_type: str = "", region: str = "", query: str = ""):
        return search_creatives(product_type, region, query)

    @router.get("/materials/{material_id}/image")
    async def thumbnail(material_id: str):
        material = await invoke(get_creative, material_id)
        order = {"product_name": material["title"].split(" · ")[0], "product_type": material["product_type"],
                 "target_region": "、".join(material["regions"]), "target_users": "演示用户",
                 "marketing_goal": "演示素材", "platform": "Meta", "language": "English",
                 "aspect_ratio": "4:5", "constraints": ""}
        raw = await asyncio.to_thread(render_layout, order, fallback_plan(order, material), material)
        return Response(raw, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})

    @router.post("/plans")
    async def plan(payload: CreativeOrder):
        return await invoke(service.plan, payload.model_dump(mode="json"))

    @router.get("/plans/{plan_id}")
    async def read_plan(plan_id: str):
        return await invoke(service.get_plan, plan_id)

    @router.get("/jobs")
    def history():
        return [{"id": j["id"], "plan_id": j["plan_id"], "request_id": j["request_id"], "product_name": j["order"]["product_name"],
                 "version": j["version"], "status": j["status"], "created_at": j["created_at"],
                 "provider": j["provider"], "approved": bool(j["approval"]), "reviewed": bool(j["review"]),
                 "source_run_id": j["source_run_id"], "parent_job_id": j["parent_job_id"]}
                for j in sorted(service.jobs.values(), key=lambda x: x["created_at"], reverse=True)]

    @router.post("/plans/{plan_id}/generate", status_code=202)
    async def generate(plan_id: str, payload: GenerateAd):
        return await invoke(service.create_job, plan_id, payload.model_dump(mode="json"))

    @router.get("/jobs/{job_id}")
    async def read_job(job_id: str):
        return await invoke(service.get_job, job_id)

    @router.post("/jobs/{job_id}/approve")
    async def approve(job_id: str, payload: DeliveryApproval):
        return await invoke(service.approve, job_id)

    @router.post("/jobs/{job_id}/review")
    async def review(job_id: str, payload: CreativeReview):
        return await invoke(service.review, job_id, payload.model_dump(mode="json"))

    @router.post("/jobs/{job_id}/iterate")
    async def iterate(job_id: str, payload: IterateAd):
        return await invoke(service.iterate, job_id, payload.feedback)

    @router.get("/jobs/{job_id}/image")
    async def image(job_id: str, download: bool = False):
        job = await invoke(service.get_job, job_id)
        if job["status"] != "succeeded":
            raise HTTPException(409, "图片尚未生成成功")
        return FileResponse(service.directory / (job["id"] + ".png"), media_type="image/png",
                            filename="advertisement.png" if download else None)

    @router.get("/jobs/{job_id}/bundle")
    async def bundle(job_id: str):
        raw = await invoke(service.bundle, job_id)
        return Response(raw, media_type="application/zip",
                        headers={"Content-Disposition": 'attachment; filename="adinsight-creative-delivery.zip"'})

    return router
