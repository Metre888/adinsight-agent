import json
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

DATA = Path(__file__).resolve().parents[1] / "data"
COLLECTIONS = {
    "market_knowledge": "市场知识库", "competitor_case": "竞品案例库",
    "campaign_case": "历史 Campaign 案例库", "review_case": "投放复盘案例库",
}
FILES = ["market_knowledge", "competitor_cases", "campaign_cases", "review_cases"]
REGIONS = {
    "东南亚": ["东南亚", "泰国", "印尼", "越南", "sea", "thailand", "indonesia"],
    "欧美": ["欧美", "美国", "欧洲", "英国", "北美", "usa", "europe"],
    "拉美": ["拉美", "巴西", "墨西哥", "brazil", "mexico", "latam"],
}


class KnowledgeRetriever:
    def __init__(self):
        self.documents = []
        for name in FILES:
            self.documents.extend(json.loads((DATA / f"{name}.json").read_text(encoding="utf-8")))
        corpus = [json.dumps(d, ensure_ascii=False) for d in self.documents]
        # Character n-grams retain Chinese phrases and mixed-language product names.
        self.vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(2, 4))
        self.matrix = self.vectorizer.fit_transform(corpus)

    def search(self, product_type: str, region: str, query: str = "", collection: str = "all", limit: int = 4):
        if collection not in {*COLLECTIONS, "all"}:
            raise ValueError("未知知识集合")
        requested = {name for name, aliases in REGIONS.items() if any(a in region.lower() for a in aliases)}
        scores = cosine_similarity(self.vectorizer.transform([f"{product_type} {region} {query}"]), self.matrix)[0]
        sources = []
        for d, score in zip(self.documents, scores):
            if collection != "all" and d["source_type"] != collection:
                continue
            content = json.dumps(d, ensure_ascii=False)
            if product_type not in content:
                continue
            available = {name for name in REGIONS if name in content}
            if requested and available and not requested.intersection(available):
                continue
            if not requested and "全球" not in content and region not in content:
                continue
            if score < 0.025:
                continue
            sources.append({
                "id": d["id"], "source_type": d["source_type"], "title": d["title"],
                "summary": d.get("summary", d.get("review_conclusion", "")),
                "relevance_reason": f"产品类型匹配「{product_type}」；市场范围匹配或为通用案例。文本相似度仅用于排序。",
                "score": round(float(score), 3), "is_mock": True, "content": d,
            })
        sources.sort(key=lambda x: x["score"], reverse=True)
        return sources[:max(1, min(limit, 8))]

    def get_summary(self):
        return {"total_sources": len(self.documents), "data_policy": "synthetic_only",
                "collections": [{"source_type": key, "name": name,
                                 "count": sum(d["source_type"] == key for d in self.documents)}
                                for key, name in COLLECTIONS.items()]}

    def retrieve(self, brief, top_k=8):
        return self.search(brief["product_type"], brief["target_region"],
                           brief.get("current_challenges", ""), limit=top_k)

    def retrieve_review_cases(self):
        return [d for d in self.documents if d["source_type"] == "review_case"]
