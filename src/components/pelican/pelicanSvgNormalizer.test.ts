import { describe, expect, it } from "vitest";
import { normalizeSvgForDisplay } from "./pelicanSvgNormalizer";

describe("normalizeSvgForDisplay", () => {
  it("处理空字符串或无 SVG 标签时返回原始文本", () => {
    expect(normalizeSvgForDisplay("")).toBe("");
    expect(normalizeSvgForDisplay("hello world")).toBe("hello world");
  });

  it("当 SVG 缺失 viewBox 但包含 width 和 height 时，自动补充 viewBox 并设置 preserveAspectRatio", () => {
    const rawSvg = '<svg width="500" height="300"><circle cx="50" cy="50" r="40"/></svg>';
    const result = normalizeSvgForDisplay(rawSvg);
    expect(result).toContain('viewBox="0 0 500 300"');
    expect(result).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("当 SVG width/height 带有 px 单位时能正确解析并注入数值型 viewBox", () => {
    const rawSvg = '<svg width="800px" height="600px"><rect width="800" height="600"/></svg>';
    const result = normalizeSvgForDisplay(rawSvg);
    expect(result).toContain('viewBox="0 0 800 600"');
    expect(result).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("当 SVG 已有 viewBox 时，不重复注入 viewBox，补齐 preserveAspectRatio", () => {
    const rawSvg = '<svg viewBox="0 0 100 100"><path d="M0 0h100v100H0z"/></svg>';
    const result = normalizeSvgForDisplay(rawSvg);
    expect(result).toContain('viewBox="0 0 100 100"');
    expect(result).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("当 SVG 原有 preserveAspectRatio 为 none 时，自动纠正为 xMidYMid meet", () => {
    const rawSvg = '<svg viewBox="0 0 200 200" preserveAspectRatio="none"><path d="M0 0"/></svg>';
    const result = normalizeSvgForDisplay(rawSvg);
    expect(result).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(result).not.toContain('preserveAspectRatio="none"');
  });
});
