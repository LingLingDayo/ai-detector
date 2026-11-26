export const AUTO_UPDATE_CHECK_INTERVAL_MS = 86_400_000;

export function isAutoCheckDue(
  lastCheckedAt: number | null,
  now: number,
  intervalMs: number = AUTO_UPDATE_CHECK_INTERVAL_MS
): boolean {
  if (lastCheckedAt === null || !Number.isFinite(lastCheckedAt)) {
    return true;
  }
  if (lastCheckedAt > now) {
    return true;
  }
  return now - lastCheckedAt >= intervalMs;
}
