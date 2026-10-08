import { ref, onUnmounted } from "vue";

export function useClipboard(timeout = 2000) {
  const copied = ref(false);
  let timer: number | null = null;

  async function copy(text: string): Promise<boolean> {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      copied.value = true;
      if (timer) {
        clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        copied.value = false;
      }, timeout);
      return true;
    } catch (err) {
      console.warn("复制失败:", err);
      return false;
    }
  }

  function reset(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    copied.value = false;
  }

  onUnmounted(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });

  return {
    copied,
    copy,
    reset,
  };
}
