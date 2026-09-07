from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from models import Measurements


class CreativeOrder(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    product_name: str = Field(min_length=1, max_length=100)
    product_type: str = Field(min_length=1, max_length=100)
    target_region: str = Field(min_length=1, max_length=200)
    target_users: str = Field(min_length=1, max_length=1000)
    marketing_goal: str = Field(min_length=1, max_length=1000)
    platform: str = Field(default="Meta", min_length=1, max_length=100)
    language: Literal["English", "简体中文"] = "English"
    aspect_ratio: Literal["1:1", "4:5", "9:16"] = "4:5"
    route: Literal["library", "prompt"] = "library"
    constraints: str = Field(default="", max_length=2000)
    source_run_id: UUID | None = None
    material_id: str | None = Field(default=None, max_length=100)


class Shot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timing: str = Field(max_length=40)
    visual: str = Field(max_length=600)
    voiceover: str = Field(max_length=600)


class CreativePlan(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    headline: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=240)
    cta: str = Field(min_length=1, max_length=40)
    visual_direction: str = Field(min_length=1, max_length=1200)
    prompt: str = Field(min_length=10, max_length=8000)
    constraints: str = Field(min_length=1, max_length=4000)
    storyboard: list[Shot] = Field(min_length=1, max_length=6)


class GenerateAd(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    provider: Literal["mock", "openai", "google"]
    content: CreativePlan
    content_approved: Literal[True]
    external_consent: bool = False


class DeliveryApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    acknowledged: Literal[True]


class CreativeReview(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    metrics: Measurements
    notes: str = Field(default="", max_length=1500)
    data_mode: Literal["mock"] = "mock"


class IterateAd(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    feedback: str = Field(min_length=1, max_length=2000)
