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
});
