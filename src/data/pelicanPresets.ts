export interface PelicanPreset {
  id: string;
  name: string;
  prompt: string;
}

export const PELICAN_PRESETS: PelicanPreset[] = [
  {
    id: "en-static",
    name: "静态 SVG (英文)",
    prompt: "Generate an SVG of a pelican riding a bicycle. Reply with the SVG code only.",
  },
  {
    id: "en-animated",
    name: "动态 SVG (英文)",
    prompt: "Generate an animated SVG of a pelican riding a bicycle. Reply with the SVG code only.",
  },
  {
    id: "zh-static",
    name: "静态 SVG (中文)",
    prompt: "生成一只骑自行车的鹈鹕的 SVG。仅回复 SVG 代码。",
  },
  {
    id: "zh-animated",
    name: "动态 SVG (中文)",
    prompt: "生成一只骑自行车的鹈鹕的动态 SVG。仅回复 SVG 代码。",
  },
  {
    id: "zh-crane-cart",
    name: "丹顶鹤 SVG",
    prompt: "生成一只推着小推车丹顶鹤的动态矢量图。仅回复矢量图代码。",
  },
];
