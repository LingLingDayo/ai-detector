/**
 * 判断错误是否为超出项目设定时间的超时错误。
 * 当请求超过项目设定的超时时间时，不应当再进行静默重试。
 *
 * 覆盖场景包括：
 * 1. Tauri Rust 后端流式首次响应超时："流式请求首次响应超时（...秒内未收到上游响应）"
 * 2. Tauri Rust 后端首包响应超时："流式请求首次响应超时（...秒内未收到模型首包响应）"
 * 3. Tauri Rust 后端流式后续传输中断："上游流式响应传输中断（90 秒内未收到后续数据分片）"
 * 4. Tauri Rust 后端同步请求超时："同步请求超时（...秒内未收到上游响应）"
 * 5. Web fallback 抛出的流式或同步超时
 * 6. 网络底层或标准库抛出的 TimeoutError / timed out / deadline has elapsed
 */
export function isTimeoutError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg) return false;

  const lowerMsg = msg.toLowerCase();
  return (
    lowerMsg.includes("超时") ||
    lowerMsg.includes("timed out") ||
    lowerMsg.includes("timedout") ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("deadline has elapsed") ||
    lowerMsg.includes("未收到上游响应") ||
    lowerMsg.includes("未收到模型首包响应") ||
    lowerMsg.includes("未收到后续数据分片")
  );
}
