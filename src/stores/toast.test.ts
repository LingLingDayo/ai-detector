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

  it("下载提示单独保存真实路径且不覆盖原有消息", () => {
    const store = useToastStore();
    const filePath = "C:\\Users\\admin\\Downloads\\pelican-model.gif";

    store.showToast({
      type: "success",
      title: "下载完成",
      message: "pelican-model.gif",
      filePath,
    });

    expect(store.toastState.filePath).toBe(filePath);
    expect(store.toastState.message).toBe("pelican-model.gif");
  });

  it("无路径的新提示不会保留上一条下载路径", () => {
    const store = useToastStore();

    store.showToast({ title: "下载完成", filePath: "D:\\下载\\pelican.gif" });
    store.showToast({ title: "已复制图形代码" });

    expect(store.toastState.filePath).toBe("");
  });

  it("重置提示时清空下载路径", () => {
    const store = useToastStore();

    store.showToast({ title: "下载完成", filePath: "D:\\下载\\pelican.gif" });
    store.resetToast();

    expect(store.toastState.filePath).toBe("");
    expect(store.toastState.isOpen).toBe(false);
  });

  it("键盘焦点进入时暂停并按剩余时长恢复", () => {
    const store = useToastStore();

    store.showToast({ title: "下载完成", duration: 3000 });
    vi.advanceTimersByTime(1000);
    store.pauseToast("focus");
    vi.advanceTimersByTime(10_000);

    expect(store.toastState.isOpen).toBe(true);

    store.resumeToast("focus");
    vi.advanceTimersByTime(1999);
    expect(store.toastState.isOpen).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.toastState.isOpen).toBe(false);
  });

  it("悬停移出后键盘焦点仍可阻止提示消失", () => {
    const store = useToastStore();

    store.showToast({ title: "下载完成", duration: 2000 });
    vi.advanceTimersByTime(500);
    store.pauseToast("pointer");
    store.pauseToast("focus");
    store.resumeToast("pointer");
    vi.advanceTimersByTime(10_000);

    expect(store.toastState.isOpen).toBe(true);

    store.resumeToast("focus");
    vi.advanceTimersByTime(1499);
    expect(store.toastState.isOpen).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.toastState.isOpen).toBe(false);
  });

  it("焦点离开后悬停仍可阻止提示消失", () => {
    const store = useToastStore();

    store.showToast({ title: "下载完成", duration: 1000 });
    store.pauseToast("focus");
    store.pauseToast("pointer");
    store.resumeToast("focus");
    vi.advanceTimersByTime(5000);

    expect(store.toastState.isOpen).toBe(true);

    store.resumeToast("pointer");
    vi.advanceTimersByTime(1000);
    expect(store.toastState.isOpen).toBe(false);
  });

  it("重复暂停同一原因不会使提示永久暂停", () => {
    const store = useToastStore();

    store.showToast({ title: "下载完成", duration: 1000 });
    store.pauseToast("focus");
    store.pauseToast("focus");
    store.resumeToast("focus");
    vi.advanceTimersByTime(1000);

    expect(store.toastState.isOpen).toBe(false);
  });

  it("暂停中替换下载提示时保留全部暂停原因", () => {
    const store = useToastStore();

    store.showToast({ title: "正在生成", duration: 2000 });
    store.pauseToast("pointer");
    store.pauseToast("focus");
    store.showToast({
      title: "下载完成",
      filePath: "D:\\下载\\pelican.gif",
      duration: 1000,
    });
    store.resumeToast("pointer");
    vi.advanceTimersByTime(5000);

    expect(store.toastState.isOpen).toBe(true);
    expect(store.toastState.filePath).toBe("D:\\下载\\pelican.gif");

    store.resumeToast("focus");
    vi.advanceTimersByTime(1000);
    expect(store.toastState.isOpen).toBe(false);
  });
});
