# 广告创意交付 · 产品与实现说明
版本 0.3，2026-09-07。个人独立 Demo；所有素材库案例、参考视觉和投放数据均为合成数据。不是商业效果或素材授权证明。

## 产品闭环
客户需求 → 并行研究与证据 → 人工确认方向 → Campaign Brief → 广告制作需求 → 历史素材复用 / 提示词创作 → 人工编辑与模型选择 → 图片生成 → 交付确认 → 模拟投放复盘 → 新一轮创意方案。

研究入口与创作入口都保留。已有明确需求的客户可以直接进入“广告创意交付”；需要策略支持时，从完成的 Brief 点击“制作广告”。关联时继承产品、类型、市场、人群、营销目标以及整份 Campaign Brief 快照，不允许悄悄替换关联的关键需求。平台、画幅、输出语言和内容约束由客户进一步确认。

本版不是自动媒体投放系统。不存在“模型生成后直接发布”的动作；交付确认只是个人 Demo 的客户审核记录。

## 两条创作路径
| 路径 | 客户操作 | 后台执行 | 交付依据 |
|---|---|---|---|
| 历史素材复用 | 筛选产品 / 市场 / 关键词，选择一个素材 | creative MCP 的 search_creatives + get_creative；检查匹配和演示权限 | 保留素材 ID、摘要、复用建议和参考图片 |
| 提示词创作 | 输入产品、人群、目标、平台、比例与约束 | Creative Planner 调用 DeepSeek JSON；无密钥 / 失败时 Mock | 不添加不存在的历史引用 |

素材库包含 3 类虚构产品的 6 个方案，使用 3 张 AI 合成主视觉及各自版式变体。没有真实 CTR、ROAS 排名；不把高点击率当作因果证据。素材权限字段 synthetic_demo 只表示本地演示可复用，不能替代正式商用权利审核。

首版输出英语或简体中文；支持 1:1、4:5、9:16 图片。其他本地语言需后续扩展与人工审校。15 秒视频交付为可编辑分镜与提示词，不包含视频成片或视频模型调用。

## 提示词与模型
方案结构：headline、body、cta、visual_direction、prompt、constraints、storyboard。客户可以修改全部文案、画面提示和分镜旁白。修改后清除内容确认与外部数据发送授权。生成时保存不可变快照，后续编辑不会改写已生成广告。

| 选项 | 接入 | 输出与边界 |
|---|---|---|
| 本地排版预览 | Pillow，无图像 API 调用 | 渲染标题、正文、CTA 与选定参考图；提示词路径为文字排版，不声称理解自由画面提示词 |
| OpenAI GPT Image 2 | OpenAI SDK，gpt-image-2 | 无参考时 images.generate；有参考时 images.edit，实际传参考图 bytes |
| Google Nano Banana 2 | Gemini Interactions REST，gemini-3.1-flash-image | 文本与可选参考图 parts，response_format 指定画幅，store=false |

外部图片模型的 endpoint 和 model 在服务端白名单中，不接受浏览器传入任意 URL 或任意命令。OPENAI_API_KEY / GEMINI_API_KEY 仅在后端 .env；前端只能看配置状态，不能读取密钥。“已配置”不等于“已验证该账号可调用”。

内容确认适用于所有生成。外部生成还必须逐次确认数据发送与可能费用。调用失败保存 failed，不改标为 Mock 成功，不自动切换模型，不自动重试。可以手动回到编辑页，再显式选择本地模式。

## 交付与复盘
每个 job 绑定 plan_id、source_run_id、parent_job_id、创意轮次 version、唯一 request_id、输入与文案快照、参考素材、provider/model、确认时间。V1、V2 表示创意迭代轮次；同一轮重新生成可以有多个独立 job ID，不覆盖已交付图片。

生成成功需通过图片解码、文件大小、像素上限和比例检查。自动检查不等于文案真实性、版权或品牌审核。只有成功图片可以人工确认；只有已确认广告可以录入本地模拟投放数据。

复盘通过 measurement MCP 计算 CTR / CVR / CPA / ROAS / 素材采纳率以及样本量。数字由确定性函数生成，不交给 LLM 计算。当前合成口径：USD、试用完成事件、7 天点击归因假设。每份复盘绑定一个广告版本，提交后不可覆盖；下一轮保留父版本、数据快照与客户反馈。

“带入复盘，创建 V2”生成新的待确认方案；不自动调用图片模型。前一版已确认标题保留在 Mock 修订中，正文 / CTA 使用透明的本地修订模板；DeepSeek 模式同时收到前一版文案与修改意见。实验建议仍是未执行假设。广告改版与落地页测试需要分开控制变量，不因生成了 V2 就声称完成了 A/B 实验。

## 可下载交付包
- advertisement.png：当前版本图片。
- creative-brief.json：需求、文案、素材来源、模型信息、确认及复盘快照。
- generation-prompt.txt：与生成使用相同的完整组合提示词。
- storyboard.json：15 秒分镜与旁白。
- DELIVERY-NOTES.txt：Mock / 模型输出性质、待确认 / 已确认、使用边界。

包不包含 .env、API Key、后台调用明细、研究历史目录或私人讲解材料。未人工确认时仍允许下载草稿，交付说明明确标记待审核。已确认不代表已发布。

## API
前缀 /api/creative；完整请求 Schema 见本机 /docs。
| 方法与路径 | 作用 |
|---|---|
| GET /providers | 模型白名单、能力、配置状态、外部调用策略 |
| GET /materials | product_type / region / query 筛选素材摘要 |
| GET /materials/{id}/image | 模板渲染的素材缩略图 |
| POST /plans | 创建方案并读取 MCP 来源；source_run_id 可关联已完成 Brief |
| GET /plans/{id} | 恢复方案、来源与父版本 |
| POST /plans/{id}/generate | GenerateAd：request_id、provider、content、content_approved=true、external_consent |
| GET /jobs | 历史生成、交付与复盘状态 |
| GET /jobs/{id} | 当前生成状态和交付快照 |
| POST /jobs/{id}/approve | acknowledged=true，记录演示交付确认 |
| POST /jobs/{id}/review | metrics 原始计数、notes、data_mode=mock |
| POST /jobs/{id}/iterate | feedback，返回新的待确认方案 |
| GET /jobs/{id}/image | 当前图片；download=true 下载 |
| GET /jobs/{id}/bundle | ZIP 交付包 |

状态：running → succeeded / failed / interrupted。人工审批记录与 review 作为独立字段，不使用假的“投放完成”状态。重复 request_id + 相同载荷返回同一 job；同 ID 不同载荷拒绝。浏览器先持久化待确认提交信息，恢复时优先匹配历史请求，不在刷新后自动发起计费生成。

## 运行与安全
JSON 与 PNG 保存在 backend/.runtime/creative/。方案上限 100、生成记录上限 100、规划并发 3、生成并发 2；达到上限拒绝新建，不静默删除已有交付。重启时将运行中的生成标记 interrupted，不自动重试；外部费用可能已产生，需在服务商处核对。

本 Demo 仅限单进程、本机回环地址。没有客户账户、租户隔离、媒体审核服务、费用配额或多副本锁。公开服务必须补充身份鉴权、服务认证、请求限流、图片内容审核、密钥托管、持久队列、可删除策略及供应商回执对账。不能直接将本机 Demo 暴露到公网。

Linux 中文排版建议安装可用 CJK 字体并配置 ADINSIGHT_FONT_PATH；缺少字体时中文可能缺字。英文预览可用 DejaVu Sans。所有平台都应检查交付图片中的字符与品牌文案。

## 验证
自动化覆盖：真实 MCP 素材检索、分类市场过滤、权限与路径白名单、模型 JSON 校验、完整研究到复盘迭代链路、文案快照、幂等、无授权 / 无密钥拒绝、外部失败不伪装成功、图片解码与尺寸、导出清单、重启不重试、OpenAI / Google 参考图请求适配（测试替身）。
真实外部生成需有效账号权限与额度。本次没有配置图片服务密钥，未发起真实付费模型调用。

## 官方技术依据
2026-09-07 核对：[OpenAI Image Generation](https://developers.openai.com/api/docs/guides/image-generation) 的生成 / 编辑接口；[Gemini Image Generation](https://ai.google.dev/gemini-api/docs/image-generation) 的图像输入输出；[Gemini Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview) 的 store=false 与响应结构。SDK / REST 适配不等于真实账号已通过联调。

