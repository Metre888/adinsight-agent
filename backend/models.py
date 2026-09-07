from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class BriefRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, str_max_length=2000, extra="forbid")
    product_name: str = Field(min_length=1, max_length=100)
    product_type: str = Field(min_length=1, max_length=100)
    target_region: str = Field(min_length=1, max_length=200)
    target_users: str = Field(min_length=1)
    marketing_goal: str = Field(min_length=1)
    platforms: str = ""
    budget_range: str = ""
    current_challenges: str = ""
    additional_notes: str = ""
    scenario: Literal["leaky", "healthy", "empty"] = "leaky"


class Approval(BaseModel):
    direction_id: Literal["proof", "scenario", "local"]
    feedback: str = Field(default="", max_length=1500)
    acknowledged: Literal[True]


class Measurements(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    impressions: int = Field(ge=0)
    clicks: int = Field(ge=0)
    conversions: int = Field(ge=0)
    spend: float = Field(ge=0)
    revenue: float = Field(ge=0)
    creatives_total: int = Field(ge=0)
    creatives_used: int = Field(ge=0)

    @model_validator(mode="after")
    def consistent(self):
        if not self.conversions <= self.clicks <= self.impressions:
            raise ValueError("需满足 转化数 <= 点击数 <= 曝光数")
        if self.creatives_used > self.creatives_total:
            raise ValueError("采纳素材数不能超过提交素材数")
        return self


class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=160)
    detail: str = Field(min_length=1, max_length=1500)
    source_ids: list[str] = Field(default_factory=list, max_length=6)


class Research(BaseModel):
    model_config = ConfigDict(extra="forbid")
    headline: str = Field(min_length=1, max_length=180)
    findings: list[Evidence] = Field(min_length=1, max_length=6)
    risks: list[str] = Field(min_length=1, max_length=6)


class Campaign(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_background: str = Field(min_length=1)
    marketing_goal: str = Field(min_length=1)
    target_users: str = Field(min_length=1)
    core_insight: str = Field(min_length=1)
    selling_points: list[str] = Field(min_length=1, max_length=5)
    creative_direction: str = Field(min_length=1)
    channel_suggestions: list[str] = Field(min_length=1, max_length=5)
    ab_test_plan: list[str] = Field(min_length=1, max_length=5)
    source_ids: list[str]
    limitations: list[str] = Field(min_length=1)
