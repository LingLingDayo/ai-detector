import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useToastStore } from "./toast";

describe("公共顶部提示", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("成功提示按默认时长自动关闭", () => {
    const store = useToastStore();

    store.showToast({ type: "success", title: "测试成功" });

    expect(store.toastState).toMatchObject({
      isOpen: true,
      type: "success",
      title: "测试成功",
      message: "",
    });

    vi.advanceTimersByTime(3999);
    expect(store.toastState.isOpen).toBe(true);

    vi.advanceTimersByTime(1);
    expect(store.toastState.isOpen).toBe(false);
  });

  it("失败提示保留详细信息并支持手动关闭", () => {
    const store = useToastStore();

    store.showToast({
      type: "error",
      title: "测试失败",
      message: "上游接口返回错误 (HTTP 500)",
      duration: 6000,
    });

    expect(store.toastState).toMatchObject({
      isOpen: true,
      type: "error",
      title: "测试失败",
      message: "上游接口返回错误 (HTTP 500)",
    });

    store.hideToast();
    expect(store.toastState.isOpen).toBe(false);
  });

  it("空标题不会触发提示", () => {
    const store = useToastStore();

    store.showToast({ title: "   " });

    expect(store.toastState.isOpen).toBe(false);
  });

  it("悬停时暂停自动关闭，移出后按剩余时间继续", () => {
    const store = useToastStore();

    store.showToast({ title: "测试成功", duration: 3000 });
    vi.advanceTimersByTime(1000);

    store.pauseToast();
    vi.advanceTimersByTime(10_000);
    expect(store.toastState.isOpen).toBe(true);

    store.resumeToast();
    vi.advanceTimersByTime(1999);
    expect(store.toastState.isOpen).toBe(true);

    vi.advanceTimersByTime(1);
    expect(store.toastState.isOpen).toBe(false);
  });

  it("悬停期间展示新提示时保持暂停", () => {
    const store = useToastStore();

    store.showToast({ title: "第一条提示", duration: 2000 });
    store.pauseToast();
    vi.advanceTimersByTime(5000);

    store.showToast({ title: "第二条提示", duration: 1000 });
    vi.advanceTimersByTime(5000);
    expect(store.toastState.isOpen).toBe(true);

    store.resumeToast();
    vi.advanceTimersByTime(999);
    expect(store.toastState.isOpen).toBe(true);

    vi.advanceTimersByTime(1);
    expect(store.toastState.isOpen).toBe(false);
  });

  it("不自动关闭的提示在悬停移出后仍保持打开", () => {
    const store = useToastStore();

    store.showToast({ title: "持续提示", duration: 0 });
    store.pauseToast();
    store.resumeToast();
    vi.advanceTimersByTime(10_000);

    expect(store.toastState.isOpen).toBe(true);
  });
});
