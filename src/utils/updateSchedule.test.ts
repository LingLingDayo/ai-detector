import { describe, expect, it } from "vitest";
import { AUTO_UPDATE_CHECK_INTERVAL_MS, isAutoCheckDue } from "./updateSchedule";

describe("isAutoCheckDue", () => {
  const now = 1_700_000_000_000;

  it("首次无记录或非法时间戳时返回 true", () => {
    expect(isAutoCheckDue(null, now)).toBe(true);
    expect(isAutoCheckDue(Number.NaN, now)).toBe(true);
    expect(isAutoCheckDue(Number.POSITIVE_INFINITY, now)).toBe(true);
  });

  it("上次检查时间在未来（系统时钟回拨）时返回 true", () => {
    expect(isAutoCheckDue(now + 60_000, now)).toBe(true);
  });

  it("未满 24 小时返回 false，满 24 小时返回 true", () => {
    expect(isAutoCheckDue(now - AUTO_UPDATE_CHECK_INTERVAL_MS + 1, now)).toBe(false);
    expect(isAutoCheckDue(now - AUTO_UPDATE_CHECK_INTERVAL_MS, now)).toBe(true);
    expect(isAutoCheckDue(now - AUTO_UPDATE_CHECK_INTERVAL_MS - 10_000, now)).toBe(true);
  });

  it("支持自定义间隔", () => {
    expect(isAutoCheckDue(now - 5_000, now, 10_000)).toBe(false);
    expect(isAutoCheckDue(now - 10_000, now, 10_000)).toBe(true);
  });
});
