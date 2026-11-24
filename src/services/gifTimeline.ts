export const GIF_FRAME_RATE = 20;
export const DEFAULT_GIF_DURATION_MS = 3000;
export const MAX_GIF_DURATION_MS = 12000;
export const MAX_GIF_FRAMES = 200;

export function resolveGifFrameIntervalMs(durationMs: number): number {
  return durationMs > 6000 ? 60 : 50;
}

function greatestCommonDivisor(left: number, right: number): number {
  while (right) [left, right] = [right, left % right];
  return left;
}

export function resolveGifDuration(
  periodsMs: readonly number[],
  finiteDurationsMs: readonly number[] = []
): number {
  const periods = periodsMs.filter(value => Number.isFinite(value) && value >= 10);
  const finite = finiteDurationsMs.filter(value => Number.isFinite(value) && value >= 10);

  let loopDuration = 0;
  if (periods.length) {
    const withinLimit = Array.from(
      new Set(
        periods
          .filter(value => value <= MAX_GIF_DURATION_MS)
          .map(value => Math.round(value / 10))
      )
    ).sort((left, right) => right - left);

    if (withinLimit.length) {
      let durationTicks = withinLimit[0];
      for (let index = 1; index < withinLimit.length; index++) {
        const ticks = withinLimit[index];
        const lcm = (durationTicks / greatestCommonDivisor(durationTicks, ticks)) * ticks;
        if (lcm * 10 <= MAX_GIF_DURATION_MS) {
          durationTicks = lcm;
        }
      }
      loopDuration = durationTicks * 10;
    } else {
      loopDuration = MAX_GIF_DURATION_MS;
    }
  }

  const maxFinite = finite.length ? Math.min(MAX_GIF_DURATION_MS, Math.round(Math.max(...finite) / 10) * 10 || 10) : 0;
  const resolved = Math.max(loopDuration, maxFinite);
  if (resolved < 10) return DEFAULT_GIF_DURATION_MS;
  return Math.min(MAX_GIF_DURATION_MS, resolved);
}

/** GIF 延迟以10ms为单位，量化累计边界，避免循环加速或首尾人为停顿。 */
export function sampleGifTimeline(times: readonly number[], durationMs: number, fps = GIF_FRAME_RATE): Array<{ source: number; delay: number }> {
  if (!times.length) return [];
  if (!Number.isFinite(durationMs) || durationMs < 10 || durationMs > MAX_GIF_DURATION_MS || !Number.isFinite(fps) || fps <= 0 || fps > 60) {
    throw new Error("GIF 时间参数无效");
  }
  if (times.some((time, index) => !Number.isFinite(time) || (index > 0 && time < times[index - 1]))) {
    throw new Error("GIF 采集时间无效");
  }
  const count = Math.ceil(durationMs * fps / 1000);
  const result: Array<{ source: number; delay: number }> = [];
  let source = 0;
  for (let frame = 0; frame < count; frame++) {
    const time = frame * 1000 / fps;
    while (source + 1 < times.length && Math.abs(times[source + 1] - time) <= Math.abs(times[source] - time)) source++;
    const start = Math.round(time / 10);
    const end = Math.round(Math.min(durationMs, (frame + 1) * 1000 / fps) / 10);
    if (end > start) result.push({ source, delay: (end - start) * 10 });
  }
  return result;
}
