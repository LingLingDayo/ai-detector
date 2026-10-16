export interface PelicanPreset {
  id: string;
  name: string;
  badge: string;
  badgeType: "default" | "animated" | "chinese";
  prompt: string;
  description: string;
}

export const PELICAN_PRESETS: PelicanPreset[] = [
  {
    id: "en-static",
    name: "静态 SVG (英文)",
    badge: "默认",
    badgeType: "default",
    prompt: "Generate an SVG of a pelican riding a bicycle. Reply with the SVG code only.",
    description: "经典鹈鹕测试基准提示词",
  },
  {
    id: "en-animated",
    name: "动态 SVG (英文)",
    badge: "动画",
    badgeType: "animated",
    prompt: "Generate an animated SVG of a pelican riding a bicycle. Reply with the SVG code only.",
    description: "要求模型输出带有动画效果的 SVG",
  },
  {
    id: "zh-static",
    name: "静态 SVG (中文)",
    badge: "中文",
    badgeType: "chinese",
    prompt: "生成一只骑自行车的鹈鹕的 SVG。仅回复 SVG 代码。",
    description: "经典鹈鹕测试基准中文版",
  },
  {
    id: "zh-animated",
    name: "动态 SVG (中文)",
    badge: "动画·中",
    badgeType: "animated",
    prompt: "生成一只骑自行车的鹈鹕的动态 SVG。仅回复 SVG 代码。",
    description: "动态动画效果测试中文版",
  },
];
