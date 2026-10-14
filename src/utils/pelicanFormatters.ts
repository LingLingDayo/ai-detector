/**
 * 鹈鹕测试相关格式化工具函数
 */

/**
 * 对 API Key 进行脱敏，省略中间部分
 * 例如 sk-proj-1234567890abcdef -> sk-pro****cdef
 */
export function maskApiKey(apiKey?: string): string {
  if (!apiKey) return "-";
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    if (trimmed.length <= 4) return "****";
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 6)}****${trimmed.slice(-4)}`;
}

/**
 * 格式化思考强度档位标签
 */
export function formatReasoningEffort(effort?: string): string {
  if (!effort) return "高 (high)";
  const map: Record<string, string> = {
    none: "关闭 (none)",
    minimal: "极低 (minimal)",
    low: "低 (low)",
    medium: "中 (medium)",
    high: "高 (high)",
    xhigh: "极高 (xhigh)",
    max: "最高 (max)",
    ultra: "极致 (ultra)",
  };
  return map[effort.toLowerCase()] || effort;
}

/**
 * 格式化历史记录时间
 */
export function formatHistoryTime(timestamp?: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}.${m}.${d} ${h}:${min}`;
}
