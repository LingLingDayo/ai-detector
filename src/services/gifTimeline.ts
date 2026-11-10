/** GIF uses centiseconds. Round cumulative boundaries to avoid speeding up 30fps to 33fps. */
export function sampleGifTimeline(times: readonly number[], durationMs: number, fps = 30): Array<{ source: number; delay: number }> {
  if (!times.length || durationMs <= 0 || fps <= 0) return [];
  const count = Math.ceil(durationMs * fps / 1000);
  const result: Array<{ source: number; delay: number }> = [];
  let source = 0;
  for (let frame = 0; frame < count; frame++) {
    const time = frame * 1000 / fps;
    while (source + 1 < times.length && Math.abs(times[source + 1] - time) <= Math.abs(times[source] - time)) source++;
    const start = Math.round(time / 10);
    const end = Math.round(Math.min(durationMs, (frame + 1) * 1000 / fps) / 10);
    result.push({ source, delay: (end - start) * 10 });
  }
  return result;
}
