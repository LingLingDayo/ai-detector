export type ModelRoutingStatus = "match" | "mismatch" | "unknown";

/** 统一大小写、路径前缀与常见版本分隔符，便于比较同一模型的不同写法。 */
export function normalizeModelName(name?: string): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .replace(/^models\//, "")
    .replace(/[._\s]+/g, "-")
    .replace(/-+/g, "-");
}

export function getModelLeafName(name?: string): string {
  const normalized = normalizeModelName(name);
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1);
}

// 允许上游在模型名后追加日期版本、路由变体等后缀，但不把 -mini / -pro 等不同型号误判为一致
const MODEL_VARIANT_SUFFIX =
  /^(?:[-@:](?:latest|preview|beta|alpha|thinking|high|low|free|extended|online|stable|v\d+(?:-\d+)*)|-?\d{4}-?\d{2}-?\d{2})$/;

export function modelsMatch(requested?: string, actual?: string): boolean {
  const req = normalizeModelName(requested);
  const act = normalizeModelName(actual);
  if (!req || !act) return false;
  if (req === act) return true;

  const reqLeaf = getModelLeafName(req);
  const actLeaf = getModelLeafName(act);
  if (reqLeaf === actLeaf) return true;

  const short = reqLeaf.length <= actLeaf.length ? reqLeaf : actLeaf;
  const long = reqLeaf.length <= actLeaf.length ? actLeaf : reqLeaf;
  if (!short || !long.startsWith(short)) return false;

  const suffix = long.slice(short.length);
  return MODEL_VARIANT_SUFFIX.test(suffix);
}

export function getModelRoutingStatus(
  requested?: string,
  actual?: string
): ModelRoutingStatus {
  if (!actual?.trim()) return "unknown";
  return modelsMatch(requested, actual) ? "match" : "mismatch";
}
