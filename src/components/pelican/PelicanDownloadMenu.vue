<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch, type CSSProperties } from "vue";
import { Download, Loader2 } from "@lucide/vue";
import type { PelicanDownloadFormat } from "../../services/pelicanExportTypes";

const props = withDefaults(
  defineProps<{
    contentType?: "svg" | "html";
    disabled?: boolean;
    gifAvailable?: boolean;
    iconOnly?: boolean;
  }>(),
  { contentType: "svg", disabled: false, gifAvailable: false, iconOnly: false }
);

const emit = defineEmits<{
  (e: "download", format: PelicanDownloadFormat): void;
  (e: "open-change", isOpen: boolean): void;
}>();

const triggerId = `pelican-download-${useId()}`;
const menuId = `${triggerId}-menu`;
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLDivElement | null>(null);
const isOpen = ref(false);
const activeIndex = ref(0);
const menuStyle = ref<CSSProperties>({ visibility: "hidden" });
const options = computed(() => [
  { format: props.contentType, label: `${props.contentType.toUpperCase()} 文件`, disabled: false },
  { format: "gif" as const, label: "GIF 动图", disabled: !props.gifAvailable },
]);

function containsTarget(target: EventTarget | null): boolean {
  return target instanceof Node && Boolean(
    triggerRef.value?.contains(target) || menuRef.value?.contains(target)
  );
}

function updateMenuPosition(): void {
  if (!isOpen.value || !triggerRef.value || !menuRef.value) return;
  const anchor = triggerRef.value.getBoundingClientRect();
  const menu = menuRef.value.getBoundingClientRect();
  const margin = 8;
  const gap = 4;
  const width = Math.min(menu.width || 120, window.innerWidth - margin * 2);
  const height = menu.height || 72;
  const spaceBelow = Math.max(0, window.innerHeight - anchor.bottom - gap - margin);
  const spaceAbove = Math.max(0, anchor.top - gap - margin);
  const openAbove = height > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = openAbove ? spaceAbove : spaceBelow;
  const top = openAbove ? anchor.top - gap - Math.min(height, maxHeight) : anchor.bottom + gap;

  menuStyle.value = {
    left: `${Math.max(margin, Math.min(anchor.right - width, window.innerWidth - width - margin))}px`,
    top: `${Math.max(margin, top)}px`,
    maxHeight: `${maxHeight}px`,
  };
}

function focusItem(index: number): void {
  activeIndex.value = index;
  menuRef.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[index]?.focus();
}

function openMenu(last = false): void {
  if (props.disabled || isOpen.value) return;
  isOpen.value = true;
  menuStyle.value = { visibility: "hidden" };
  nextTick(() => {
    if (!isOpen.value) return;
    updateMenuPosition();
    const enabledIndexes = options.value.flatMap((option, index) => option.disabled ? [] : [index]);
    focusItem(last ? enabledIndexes[enabledIndexes.length - 1] : enabledIndexes[0]);
  });
}

function closeMenu(restoreFocus = false): void {
  if (!isOpen.value) return;
  isOpen.value = false;
  if (restoreFocus) triggerRef.value?.focus();
}

function toggleMenu(): void {
  if (isOpen.value) closeMenu(true);
  else openMenu();
}

function selectFormat(format: PelicanDownloadFormat): void {
  if (props.disabled || options.value.find((option) => option.format === format)?.disabled) return;
  closeMenu(true);
  emit("download", format);
}

function handleMenuKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    event.stopPropagation();
    const enabledIndexes = options.value.flatMap((option, index) => option.disabled ? [] : [index]);
    const currentIndex = enabledIndexes.indexOf(activeIndex.value);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    focusItem(enabledIndexes[(currentIndex + direction + enabledIndexes.length) % enabledIndexes.length]);
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    selectFormat(options.value[activeIndex.value].format);
  }
}

function handleTriggerKeydown(event: KeyboardEvent): void {
  if (props.disabled) return;
  if (isOpen.value) {
    handleMenuKeydown(event);
    return;
  }
  if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    openMenu(event.key === "ArrowUp");
  }
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (!isOpen.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeMenu(true);
  } else if (event.key === "Tab") {
    // 浮层 Teleport 到 body，先回到触发按钮再交给浏览器处理正常 Tab 顺序。
    closeMenu(true);
  }
}

function handlePointerDown(event: PointerEvent): void {
  if (!containsTarget(event.target)) closeMenu();
}

function handleFocusIn(event: FocusEvent): void {
  if (!containsTarget(event.target)) closeMenu();
}

function handleFocusOut(event: FocusEvent): void {
  if (containsTarget(event.relatedTarget)) return;
  nextTick(() => {
    if (!containsTarget(document.activeElement)) closeMenu();
  });
}

function handleWindowBlur(): void {
  closeMenu();
}

watch(() => [props.disabled, props.contentType], () => closeMenu());
watch(isOpen, (open) => emit("open-change", open));

onMounted(() => {
  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("keydown", handleDocumentKeydown, true);
  document.addEventListener("focusin", handleFocusIn, true);
  window.addEventListener("resize", updateMenuPosition);
  window.addEventListener("scroll", updateMenuPosition, true);
  window.addEventListener("blur", handleWindowBlur);
});

onUnmounted(() => {
  isOpen.value = false;
  document.removeEventListener("pointerdown", handlePointerDown, true);
  document.removeEventListener("keydown", handleDocumentKeydown, true);
  document.removeEventListener("focusin", handleFocusIn, true);
  window.removeEventListener("resize", updateMenuPosition);
  window.removeEventListener("scroll", updateMenuPosition, true);
  window.removeEventListener("blur", handleWindowBlur);
});
</script>

<template>
  <button
    :id="triggerId"
    ref="triggerRef"
    type="button"
    class="download-trigger"
    :class="{ 'is-open': isOpen, 'is-icon-only': iconOnly }"
    :disabled="disabled"
    aria-haspopup="menu"
    :aria-expanded="isOpen"
    :aria-controls="isOpen ? menuId : undefined"
    :aria-label="iconOnly ? (disabled ? '正在生成下载文件' : '下载图片文件') : undefined"
    :title="disabled ? '正在生成下载文件' : '选择下载格式'"
    @click="toggleMenu"
    @keydown="handleTriggerKeydown"
    @focusout="handleFocusOut"
  >
    <Loader2 v-if="disabled" :size="12" class="download-spinner" />
    <Download v-else :size="12" />
    <span v-if="!iconOnly">下载</span>
  </button>
  <Teleport to="body">
    <div
      v-if="isOpen"
      :id="menuId"
      ref="menuRef"
      class="pelican-download-menu"
      role="menu"
      :aria-labelledby="triggerId"
      :style="menuStyle"
      @keydown="handleMenuKeydown"
      @focusout="handleFocusOut"
    >
      <button
        v-for="(option, index) in options"
        :key="option.format"
        type="button"
        class="download-option"
        :class="{ 'is-active': index === activeIndex }"
        role="menuitem"
        tabindex="-1"
        :data-format="option.format"
        :disabled="option.disabled"
        :aria-disabled="option.disabled"
        :title="option.disabled ? 'GIF 下载仅支持 Windows 桌面应用' : undefined"
        @click="selectFormat(option.format)"
        @focus="activeIndex = index"
      >
        {{ option.label }}
      </button>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.download-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 22px;
  padding: 0 7px;
  background: var(--bg-surface-control);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1;
  font-family: inherit;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    display: block;
    flex-shrink: 0;
  }

  .download-spinner {
    animation: spin 0.8s linear infinite;
  }

  &:hover:not(:disabled) {
    background: var(--bg-surface-control-hover);
    color: var(--accent-text);
    border-color: var(--border-surface-control-hover);
  }

  &:active:not(:disabled) {
    background: var(--bg-surface-control-active);
  }

  &.is-open {
    background: rgba(var(--accent-rgb), 0.16);
    border-color: var(--accent-primary);
    color: var(--accent-text);

    &:hover:not(:disabled) {
      background: var(--bg-surface-control-active);
      border-color: var(--accent-primary);
      color: var(--accent-text);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--border-focus);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.55;
    cursor: wait;
  }

  &.is-icon-only {
    position: relative;
    width: 24px;
    height: 24px;
    padding: 0;
    background: var(--pelican-footer-btn-bg);
    border-color: var(--pelican-footer-btn-border);
    color: var(--pelican-footer-btn-color);

    &:hover:not(:disabled),
    &.is-open:not(:disabled) {
      background: var(--pelican-footer-btn-hover-bg);
      border-color: var(--pelican-footer-btn-hover-border);
      color: var(--pelican-footer-btn-hover-color);
      transform: translateY(-1px);
    }

    &:hover:not(:disabled)::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      bottom: -2px;
    }

    &:active:not(:disabled) {
      transform: translateY(0) scale(0.92);
    }

    &:disabled {
      opacity: 0.5;
      cursor: wait;
    }
  }
}

.pelican-download-menu {
  position: fixed;
  z-index: 10050;
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 120px;
  max-width: calc(100vw - 16px);
  padding: 3px;
  box-sizing: border-box;
  overflow-y: auto;
  background: var(--bg-popover);
  border: 1px solid rgba(var(--accent-rgb), 0.35);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-popover);
}

.download-option {
  flex-shrink: 0;
  min-height: 25px;
  padding: 4px 7px;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  &:hover:not(:disabled),
  &.is-active:not(:disabled) {
    color: var(--accent-text);
    background: rgba(var(--accent-rgb), 0.12);
  }

  &:focus-visible {
    outline: 1px solid var(--border-focus);
    outline-offset: -1px;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
</style>
