import { defineStore } from "pinia";
import { onScopeDispose, reactive } from "vue";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  title: string;
  message?: string;
  type?: ToastType;
  /** 自动关闭时长，传 0 表示不自动关闭 */
  duration?: number;
}

export interface ToastState {
  isOpen: boolean;
  type: ToastType;
  title: string;
  message: string;
}

const DEFAULT_TOAST_DURATION = 4000;

export const useToastStore = defineStore("toast", () => {
  const toastState = reactive<ToastState>({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  let remainingMs = 0;
  let timerStartedAt = 0;
  let autoCloseEnabled = false;
  let isPaused = false;

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function startTimer(): void {
    if (isPaused || timer || remainingMs <= 0) return;
    timerStartedAt = Date.now();
    timer = setTimeout(hideToast, remainingMs);
  }

  function pauseToast(): void {
    if (!toastState.isOpen || isPaused) return;
    isPaused = true;
    if (!autoCloseEnabled || !timer) return;
    remainingMs = Math.max(0, remainingMs - (Date.now() - timerStartedAt));
    clearTimer();
  }

  function resumeToast(): void {
    if (!isPaused) return;
    isPaused = false;
    if (!toastState.isOpen || !autoCloseEnabled) return;
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
    isPaused = false;
    toastState.isOpen = false;
  }

  function showToast(options: ToastOptions): void {
    if (!options.title.trim()) return;
    clearTimer();
    toastState.type = options.type ?? "info";
    toastState.title = options.title;
    toastState.message = options.message ?? "";
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
    isPaused = false;
    Object.assign(toastState, {
      isOpen: false,
      type: "info",
      title: "",
      message: "",
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
