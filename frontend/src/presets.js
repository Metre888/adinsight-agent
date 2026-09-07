export const emptyBrief = {
  product_name: "",
  product_type: "AI 相机 App",
  target_region: "",
  target_users: "",
  marketing_goal: "",
  platforms: "",
  budget_range: "",
  current_challenges: "",
  additional_notes: "",
  scenario: "leaky",
};
export const presets = [
  {
    label: "LumaSnap · 东南亚",
    brief: {
      ...emptyBrief,
      product_name: "LumaSnap AI",
      product_type: "AI 相机 App",
      target_region: "泰国、印尼",
      target_users: "18–28 岁，以自拍、头像和短视频创作为主的年轻用户",
      marketing_goal: "提高试用转化，验证真实效果展示的素材方向",
      platforms: "TikTok, Meta",
      budget_range: "$8,000–$12,000",
      current_challenges:
        "点击表现尚可，但试用完成率偏低；广告与落地页体验衔接不清。",
      additional_notes:
        "使用真实录屏，不承诺完美效果；泰语和印尼语需要人工审校。",
    },
  },
  {
    label: "LinguaLoop · 欧美",
    brief: {
      ...emptyBrief,
      product_name: "LinguaLoop",
      product_type: "语言学习 App",
      target_region: "美国、英国",
      target_users: "有职场沟通和旅行口语需求的成人学习者",
      marketing_goal: "验证场景化陪练价值，提高试用完成率",
      platforms: "YouTube, Meta, Google Search",
      budget_range: "$10,000",
      current_challenges: "功能介绍同质化，用户对长期订阅价值仍有疑问。",
      additional_notes: "不承诺短期流利；清楚展示试用和续费规则。",
    },
  },
  {
    label: "Pocket Quest · 拉美",
    brief: {
      ...emptyBrief,
      product_name: "Pocket Quest",
      product_type: "休闲游戏",
      target_region: "巴西、墨西哥",
      target_users: "偏好碎片化挑战与轻量解谜的成年玩家",
      marketing_goal: "验证真实玩法素材，提升首次体验完成率",
      platforms: "TikTok, Meta",
      budget_range: "$6,000",
      current_challenges: "挑战式素材点击高，但广告玩法与实际体验存在预期差。",
      additional_notes: "葡语和西语分开制作，不使用虚假关卡。",
    },
  },
];
export const statusLabels = {
  researching: "并行研究中",
  awaiting_approval: "待确认方向",
  generating: "生成 Brief 中",
  completed: "讨论稿已就绪",
  cancelled: "已取消",
  failed: "执行失败",
  interrupted: "执行已中断",
};
export const sourceLabels = {
  market_knowledge: "市场知识",
  competitor_case: "竞品案例",
  campaign_case: "Campaign 案例",
  review_case: "复盘案例",
};
