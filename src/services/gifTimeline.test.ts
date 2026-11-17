import { describe, expect, it } from "vitest";
import { sampleGifTimeline } from "./gifTimeline";

describe("GIF 时间采样", () => {
  it("3 秒动画导出 90 帧，总时长保持 3 秒而不是 2.7 秒", () => {
    const frames = sampleGifTimeline(Array.from({ length: 180 }, (_, i) => i * 1000 / 60), 3000);
    expect(frames).toHaveLength(90);
    expect(frames.reduce((sum, frame) => sum + frame.delay, 0)).toBe(3000);
    expect(new Set(frames.map(frame => frame.delay))).toEqual(new Set([30, 40]));
    expect(new Set(frames.map(frame => frame.source)).size).toBe(90);
  });

  it("从抖动的采集时间中选择距离目标时刻最近的画面", () => {
    expect(sampleGifTimeline([0, 17, 31, 49, 69, 85], 100)).toEqual([
      { source: 0, delay: 30 }, { source: 2, delay: 40 }, { source: 4, delay: 30 },
    ]);
  });

  it("低帧率或静止内容按真实时间保持画面，不改变播放速度", () => {
    const frames = sampleGifTimeline([0, 100, 200], 300);
    expect(frames).toHaveLength(9);
    expect(frames.reduce((sum, frame) => sum + frame.delay, 0)).toBe(300);
    expect(sampleGifTimeline([0], 100).every(frame => frame.source === 0)).toBe(true);
    expect(sampleGifTimeline([], 100)).toEqual([]);
  });
});
