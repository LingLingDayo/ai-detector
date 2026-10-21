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

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function hideToast(): void {
    clearTimer();
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
    if (duration > 0) {
      timer = setTimeout(hideToast, duration);
    }
  }

  function resetToast(): void {
    clearTimer();
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
    resetToast,
  };
});
