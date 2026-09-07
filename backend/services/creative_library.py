import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "data" / "assets"


def catalog():
    return json.loads((ROOT / "data" / "creative_library.json").read_text())


def search_creatives(product_type: str = "", region: str = "", query: str = "") -> dict:
    """Search synthetic assets by category, market, and keyword; never invent performance."""
    items = []
    for item in catalog():
        if item["rights"] != "synthetic_demo":
            continue
        if product_type and product_type != item["product_type"]:
            continue
        if region and not any(r in region or region in r for r in item["regions"]):
            continue
        if query and not all(t.lower() in json.dumps(item, ensure_ascii=False).lower() for t in query.split()):
            continue
        items.append({**item, "thumbnail_url": f'/api/creative/materials/{item["id"]}/image'})
    return {"items": items, "is_mock": True, "coverage": "matched" if items else "no_match"}


def get_creative(material_id: str) -> dict:
    """Return a reusable synthetic creative with provenance."""
    item = next((m for m in catalog() if m["id"] == material_id and m["rights"] == "synthetic_demo"), None)
    if not item:
        raise ValueError("素材不存在或不具备演示复用权限")
    return {**item, "thumbnail_url": f'/api/creative/materials/{item["id"]}/image'}

