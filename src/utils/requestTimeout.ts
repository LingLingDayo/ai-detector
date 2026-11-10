/** 同步请求限制总耗时；流式请求限制首包等待及后续分片的空闲时间。 */
export function createRequestTimeout(
  controller: AbortController,
  isStream: boolean,
  timeoutSeconds: number
): { onStreamChunk: () => void; dispose: () => void } {
  let timer = setTimeout(() => {
    controller.abort(new Error(isStream
      ? `流式请求首次响应超时（${timeoutSeconds} 秒内未收到模型首包响应）`
      : `同步请求超时（${timeoutSeconds} 秒内未收到完整响应）`));
  }, timeoutSeconds * 1000);

  return {
    onStreamChunk() {
      if (!isStream) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        controller.abort(new Error("上游流式响应传输中断（90 秒内未收到后续数据分片）"));
      }, 90_000);
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}
