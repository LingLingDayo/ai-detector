import { defineStore } from "pinia";
import { onScopeDispose, reactive } from "vue";

export type ToastType = "success" | "error" | "warning" | "info";
export type ToastPauseReason = "pointer" | "focus";

export interface ToastOptions {
  title: string;
  message?: string;
  filePath?: string;
  type?: ToastType;
  /** 自动关闭时长，传 0 表示不自动关闭 */
  duration?: number;
}

export interface ToastState {
  isOpen: boolean;
  type: ToastType;
  title: string;
  message: string;
  filePath: string;
}

const DEFAULT_TOAST_DURATION = 4000;

export const useToastStore = defineStore("toast", () => {
  const toastState = reactive<ToastState>({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
    filePath: "",
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  let remainingMs = 0;
  let timerStartedAt = 0;
  let autoCloseEnabled = false;
  const pauseReasons = new Set<ToastPauseReason>();

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function startTimer(): void {
    if (pauseReasons.size > 0 || timer || remainingMs <= 0) return;
    timerStartedAt = Date.now();
    timer = setTimeout(hideToast, remainingMs);
  }

  function pauseToast(reason: ToastPauseReason = "pointer"): void {
    if (!toastState.isOpen || pauseReasons.has(reason)) return;
    pauseReasons.add(reason);
    if (!autoCloseEnabled || !timer) return;
    remainingMs = Math.max(0, remainingMs - (Date.now() - timerStartedAt));
    clearTimer();
  }

  function resumeToast(reason: ToastPauseReason = "pointer"): void {
    if (!pauseReasons.delete(reason)) return;
    if (pauseReasons.size > 0 || !toastState.isOpen || !autoCloseEnabled) return;
    if (remainingMs <= 0) {
      hideToast();
      return;
    }
    startTimer();
  }

  function hideToast(): void {
    clearTimer();
    remainingMs = 0;
    autoCloseEnabled = false;
    pauseReasons.clear();
    toastState.isOpen = false;
  }

  function showToast(options: ToastOptions): void {
    if (!options.title.trim()) return;
    clearTimer();
    toastState.type = options.type ?? "info";
    toastState.title = options.title;
    toastState.message = options.message ?? "";
    toastState.filePath = options.filePath ?? "";
    toastState.isOpen = true;

    const duration = options.duration ?? DEFAULT_TOAST_DURATION;
    remainingMs = Math.max(0, duration);
    autoCloseEnabled = duration > 0;
    startTimer();
  }

  function resetToast(): void {
    clearTimer();
    remainingMs = 0;
    autoCloseEnabled = false;
    pauseReasons.clear();
    Object.assign(toastState, {
      isOpen: false,
      type: "info",
      title: "",
      message: "",
      filePath: "",
    });
  }

  onScopeDispose(clearTimer);

  return {
    toastState,
    showToast,
    hideToast,
    pauseToast,
    resumeToast,
    resetToast,
  };
});
