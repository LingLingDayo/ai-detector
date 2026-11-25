import { describe, expect, it } from "vitest";
import { resolveGifDuration, resolveGifFrameIntervalMs, sampleGifTimeline } from "./gifTimeline";

describe("GIF 循环时间线", () => {
  it("按累计10ms边界量化，不在首尾额外停顿或重复首帧", () => {
    const result = sampleGifTimeline([0, 34, 67, 100], 100, 30);
    expect(result.map(frame => frame.delay)).toEqual([30, 40, 30]);
    expect(result.map(frame => frame.source)).toEqual([0, 1, 2]);
  });

  it.each([2000, 3000, 6000])("%i毫秒循环的总时长精确且每帧间隔一致", duration => {
    const result = sampleGifTimeline([0], duration);
    expect(result).toHaveLength(duration / 50);
    expect(result.reduce((sum, frame) => sum + frame.delay, 0)).toBe(duration);
    expect(result.every(frame => frame.delay === 50 && frame.source === 0)).toBe(true);
  });

  it("超过6秒的长动画自动切换为60ms帧间隔并覆盖12秒", () => {
    expect(resolveGifFrameIntervalMs(6000)).toBe(50);
    expect(resolveGifFrameIntervalMs(8000)).toBe(60);
    const result = sampleGifTimeline([0], 12000, 1000 / resolveGifFrameIntervalMs(12000));
    expect(result).toHaveLength(200);
    expect(result.reduce((sum, frame) => sum + frame.delay, 0)).toBe(12000);
    expect(result.every(frame => frame.delay === 60)).toBe(true);
  });

  it("按真实采集时刻选最近的帧，缺帧不加速播放", () => {
    expect(sampleGifTimeline([0, 90, 160], 200).map(frame => frame.source)).toEqual([0, 1, 1, 2]);
  });

  it("无帧返回空时间线，非有限或倒序时刻拒绝编码", () => {
    expect(sampleGifTimeline([], 3000)).toEqual([]);
    expect(() => sampleGifTimeline([0, NaN], 3000)).toThrow();
    expect(() => sampleGifTimeline([10, 0], 3000)).toThrow();
  });

  it("自动取常见动画的完整公共周期，支持6到12秒组合", () => {
    expect(resolveGifDuration([1000, 2000])).toBe(2000);
    expect(resolveGifDuration([1500, 1000])).toBe(3000);
    expect(resolveGifDuration([3300])).toBe(3300);
    expect(resolveGifDuration([2000, 3000])).toBe(6000);
    expect(resolveGifDuration([3000, 4000])).toBe(12000);
  });

  it("公倍数超出12秒时保留最长完整周期而不是腰斩为3秒", () => {
    expect(resolveGifDuration([5000, 4000])).toBe(5000);
    expect(resolveGifDuration([7000, 3000])).toBe(7000);
    expect(resolveGifDuration([15000])).toBe(12000);
  });

  it("兼容有限次分阶段动画，取循环周期与有限总时长的较大值", () => {
    expect(resolveGifDuration([], [8500])).toBe(8500);
    expect(resolveGifDuration([2000], [6500])).toBe(6500);
    expect(resolveGifDuration([], [20000])).toBe(12000);
  });

  it("周期不可读时采用有界的默认短录制", () => {
    expect(resolveGifDuration([])).toBe(3000);
    expect(resolveGifDuration([Infinity, NaN])).toBe(3000);
  });
});
