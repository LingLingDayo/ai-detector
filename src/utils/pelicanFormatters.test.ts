import { describe, expect, it } from "vitest";
import { formatThinkingDuration } from "./pelicanFormatters";

describe("formatThinkingDuration", () => {
  it("当耗时为 0、负数或非有效数值时返回空字符串", () => {
    expect(formatThinkingDuration(undefined)).toBe("");
    expect(formatThinkingDuration(Number.NaN)).toBe("");
    expect(formatThinkingDuration(-10)).toBe("");
    expect(formatThinkingDuration(0)).toBe("");
    expect(formatThinkingDuration(0.4)).toBe("");
  });

  it("当耗时大于 0 且小于 1000ms 时显示毫秒", () => {
    expect(formatThinkingDuration(1)).toBe("1ms");
    expect(formatThinkingDuration(50)).toBe("50ms");
    expect(formatThinkingDuration(999)).toBe("999ms");
    expect(formatThinkingDuration(999.9)).toBe("999ms");
  });

  it("当耗时大于等于 1000ms 时显示整秒", () => {
    expect(formatThinkingDuration(1000)).toBe("1s");
    expect(formatThinkingDuration(1999)).toBe("1s");
    expect(formatThinkingDuration(12500)).toBe("12s");
  });
});
