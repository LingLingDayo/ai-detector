import { describe, expect, it } from "vitest";
import { extractSvgBlock } from "./svgExtract";

describe("extractSvgBlock", () => {
  it("无 svg 时返回 null", () => {
    expect(extractSvgBlock("")).toBeNull();
    expect(extractSvgBlock("plain text")).toBeNull();
  });

  it("提取普通完整 svg", () => {
    const svg = '<svg viewBox="0 0 10 10"><rect/></svg>';
    expect(extractSvgBlock(`前缀 ${svg} 后缀`)).toBe(svg);
  });

  it("嵌套 svg 时保留内层闭合标签之后的外层图形（非贪婪会在此截断）", () => {
    const inner = '<svg x="1" y="2" width="3" height="4"><circle r="1"/></svg>';
    const svg = `<svg viewBox="0 0 100 100"><rect/>${inner}<circle cx="60" cy="60" r="20" fill="red"/></svg>`;
    const got = extractSvgBlock(svg);
    expect(got).toBe(svg);
    expect(got).toContain('fill="red"');
  });

  it("多层嵌套仍配平到最外层闭合", () => {
    const svg = "<svg><svg><svg></svg></svg><rect/></svg>";
    expect(extractSvgBlock(svg)).toBe(svg);
  });

  it("自闭合根 svg 直接返回该标签", () => {
    const svg = '<svg width="10" height="10"/>';
    expect(extractSvgBlock(`${svg}<svg></svg>`)).toBe(svg);
  });

  it("嵌套自闭合 svg 不影响深度", () => {
    const svg = '<svg><svg width="1" height="1"/><rect/></svg>';
    expect(extractSvgBlock(svg)).toBe(svg);
  });

  it("多个并列 svg 时返回第一个配平块", () => {
    const first = "<svg><rect/></svg>";
    const second = "<svg><circle/></svg>";
    expect(extractSvgBlock(`${first}${second}`)).toBe(first);
  });

  it("未闭合（流式截断）返回 null 交由兜底", () => {
    expect(extractSvgBlock("<svg><rect>")).toBeNull();
    expect(extractSvgBlock("<svg><svg></svg>")).toBeNull();
  });

  it("属性值内含 > 或引号时不误判标签边界", () => {
    const svg = '<svg style="a>b" data-x=\'c>d\'><rect/></svg>';
    expect(extractSvgBlock(svg)).toBe(svg);
  });
});