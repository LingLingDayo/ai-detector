/**
 * 页面滚动工具模块
 */

let activeScrollRafId: number | null = null;
const activeScrollTimers: number[] = [];

/**
 * 取消当前正在执行的页面滚动动画与定时器
 */
export function cancelPageScroll(): void {
  if (typeof window === "undefined") return;

  if (activeScrollRafId !== null) {
    window.cancelAnimationFrame(activeScrollRafId);
    activeScrollRafId = null;
  }
  while (activeScrollTimers.length > 0) {
    const timer = activeScrollTimers.pop();
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
  }
}

/**
 * 平滑滚动到当前页面最底部
 *
 * 采用 requestAnimationFrame 结合多段延时重试机制，
 * 能够稳定适应 Vue 响应式数据更新、异步 DOM 渲染与输入框高度折叠带来的页面高度变动。
 */
export function scrollToPageBottom(options?: {
  behavior?: ScrollBehavior;
  maxAttempts?: number;
}): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  cancelPageScroll();

  const behavior = options?.behavior ?? "smooth";
  const maxAttempts = options?.maxAttempts ?? 15;

  const getScrollHeight = (): number => {
    return Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0,
      document.documentElement?.offsetHeight || 0,
      document.body?.offsetHeight || 0
    );
  };

  const performScroll = () => {
    const scrollHeight = getScrollHeight();

    window.scrollTo({
      top: scrollHeight,
      behavior,
    });
    if (document.documentElement && document.documentElement.scrollTop !== undefined) {
      document.documentElement.scrollTo?.({
        top: scrollHeight,
        behavior,
      });
    }
    if (document.body && document.body.scrollTop !== undefined) {
      document.body.scrollTo?.({
        top: scrollHeight,
        behavior,
      });
    }
  };

  let attempts = 0;
  let lastTargetTop: number | null = null;

  const step = () => {
    const scrollHeight = getScrollHeight();

    if (lastTargetTop === null || Math.abs(scrollHeight - lastTargetTop) > 2) {
      lastTargetTop = scrollHeight;
      performScroll();
    }

    if (attempts < maxAttempts) {
      attempts++;
      activeScrollRafId = window.requestAnimationFrame(step);
    } else {
      activeScrollRafId = null;
    }
  };

  activeScrollRafId = window.requestAnimationFrame(() => {
    step();
    activeScrollTimers.push(window.setTimeout(performScroll, 80));
    activeScrollTimers.push(window.setTimeout(performScroll, 200));
    activeScrollTimers.push(window.setTimeout(performScroll, 350));
  });
}
