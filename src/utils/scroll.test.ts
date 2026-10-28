import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelPageScroll, scrollToPageBottom } from "./scroll";

describe("scroll 页面滚动工具模块", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cancelPageScroll();
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  });

  it("在非浏览器环境（无 window/document）下安全静默返回，不抛出异常", () => {
    // @ts-ignore 模拟无 window
    delete (globalThis as Record<string, unknown>).window;
    // @ts-ignore 模拟无 document
    delete (globalThis as Record<string, unknown>).document;

    expect(() => scrollToPageBottom()).not.toThrow();
    expect(() => cancelPageScroll()).not.toThrow();
  });

  it("触发 scrollToPageBottom 时调用 window.scrollTo 滚动到页面底部", () => {
    const mockWindowScrollTo = vi.fn();
    const mockDocElementScrollTo = vi.fn();
    const mockBodyScrollTo = vi.fn();

    let rafCallback: FrameRequestCallback | null = null;
    const mockRequestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 101;
    });
    const mockCancelAnimationFrame = vi.fn();

    globalThis.window = {
      scrollTo: mockWindowScrollTo,
      requestAnimationFrame: mockRequestAnimationFrame,
      cancelAnimationFrame: mockCancelAnimationFrame,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    } as unknown as Window & typeof globalThis;

    globalThis.document = {
      documentElement: {
        scrollHeight: 1200,
        offsetHeight: 1000,
        scrollTop: 0,
        scrollTo: mockDocElementScrollTo,
      },
      body: {
        scrollHeight: 1150,
        offsetHeight: 950,
        scrollTop: 0,
        scrollTo: mockBodyScrollTo,
      },
    } as unknown as Document;

    scrollToPageBottom();

    expect(mockRequestAnimationFrame).toHaveBeenCalled();

    if (rafCallback) {
      (rafCallback as FrameRequestCallback)(0);
    }

    expect(mockWindowScrollTo).toHaveBeenCalledWith({
      top: 1200,
      behavior: "smooth",
    });
    expect(mockDocElementScrollTo).toHaveBeenCalledWith({
      top: 1200,
      behavior: "smooth",
    });
    expect(mockBodyScrollTo).toHaveBeenCalledWith({
      top: 1200,
      behavior: "smooth",
    });

    vi.advanceTimersByTime(400);
    expect(mockWindowScrollTo).toHaveBeenCalledTimes(4);
  });

  it("调用 cancelPageScroll 可以取消尚未执行的 rAF 和计时器", () => {
    const mockCancelAnimationFrame = vi.fn();
    const mockClearTimeout = vi.fn();

    globalThis.window = {
      scrollTo: vi.fn(),
      requestAnimationFrame: vi.fn(() => 999),
      cancelAnimationFrame: mockCancelAnimationFrame,
      setTimeout: vi.fn(() => 888),
      clearTimeout: mockClearTimeout,
    } as unknown as Window & typeof globalThis;

    globalThis.document = {
      documentElement: { scrollHeight: 800 },
      body: { scrollHeight: 800 },
    } as unknown as Document;

    scrollToPageBottom();
    cancelPageScroll();

    expect(mockCancelAnimationFrame).toHaveBeenCalledWith(999);
  });
});
