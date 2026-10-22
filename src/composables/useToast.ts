import {
  useToastStore,
  type ToastOptions,
  type ToastState,
  type ToastType,
} from "../stores/toast";

export type { ToastOptions, ToastState, ToastType };

export function useToast() {
  const toastStore = useToastStore();

  return {
    toastState: toastStore.toastState,
    showToast: toastStore.showToast,
    hideToast: toastStore.hideToast,
    pauseToast: toastStore.pauseToast,
    resumeToast: toastStore.resumeToast,
  };
}
