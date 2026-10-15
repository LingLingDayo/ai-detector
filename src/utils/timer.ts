/**
 * 支持 AbortSignal 中断的异步延迟等待函数
 * @param ms 等待毫秒数
 * @param signal 可选的取消信号，一旦中止立即解除等待
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const onAbort = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };

    timer = setTimeout(() => {
      timer = null;
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
