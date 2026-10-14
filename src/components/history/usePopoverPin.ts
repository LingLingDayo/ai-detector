import { ref, onMounted, onUnmounted } from "vue";

/**
 * 详情参数悬浮面板固定/解固定交互 Composable
 * 提供点击锁定、点击外部空白区域自动取消固定，以及防止文本划选触发失焦关闭
 */
export function usePopoverPin() {
  const pinnedId = ref<string | null>(null);
  let isPointerDownInsidePopover = false;

  function handlePointerDown(e: PointerEvent): void {
    const target = (
      e.target instanceof Element ? e.target : (e.target as Node)?.parentElement
    ) as HTMLElement | null;
    isPointerDownInsidePopover = !!target?.closest(".info-tooltip-popover");
  }

  function handleDocumentClick(e: MouseEvent): void {
    if (!pinnedId.value) return;

    if (isPointerDownInsidePopover) {
      isPointerDownInsidePopover = false;
      return;
    }

    const target = (
      e.target instanceof Element ? e.target : (e.target as Node)?.parentElement
    ) as HTMLElement | null;
    if (!target) return;

    // 点击 popover 内部任何区域均不取消固定
    if (target.closest(".info-tooltip-popover")) {
      return;
    }

    // 点击触发固定/取消固定的详情按钮时，由该按钮自身的 toggle 函数处理，避免冲突
    if (target.closest(".info-icon-wrapper > button")) {
      return;
    }

    // 点击其他区域，取消所有固定状态
    pinnedId.value = null;
  }

  function togglePin(id: string, e?: Event): void {
    e?.stopPropagation();
    pinnedId.value = pinnedId.value === id ? null : id;
  }

  function clearPin(): void {
    pinnedId.value = null;
  }

  onMounted(() => {
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("click", handleDocumentClick, true);
  });

  onUnmounted(() => {
    document.removeEventListener("pointerdown", handlePointerDown, true);
    document.removeEventListener("click", handleDocumentClick, true);
  });

  return {
    pinnedId,
    togglePin,
    clearPin,
  };
}
