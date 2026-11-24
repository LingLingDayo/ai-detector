<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { AlertTriangle, Check, CheckCircle2, Copy, Info, X } from "@lucide/vue";
import { useToast } from "../../composables/useToast";
import { useClipboard } from "../../composables/useClipboard";

const { toastState, hideToast, pauseToast, resumeToast } = useToast();
const { copied: pathCopied, copy: copyPath, reset: resetPathCopy } = useClipboard();
const copyFailed = ref(false);
const toastRef = ref<HTMLElement | null>(null);

watch(() => [toastState.isOpen, toastState.title, toastState.message, toastState.filePath], () => {
  resetPathCopy();
  copyFailed.value = false;
  nextTick(() => {
    if (!toastRef.value?.contains(document.activeElement)) resumeToast("focus");
  });
});

async function handleCopyPath(): Promise<void> {
  const path = toastState.filePath;
  if (!path) return;
  const succeeded = await copyPath(path);
  if (!toastState.isOpen || toastState.filePath !== path) {
    resetPathCopy();
    return;
  }
  copyFailed.value = !succeeded;
}

function handleFocusOut(event: FocusEvent): void {
  const container = event.currentTarget as HTMLElement;
  if (!(event.relatedTarget instanceof Node) || !container.contains(event.relatedTarget)) {
    resumeToast("focus");
  }
}

const toastIcon = computed(() => {
  if (toastState.type === "success") return CheckCircle2;
  if (toastState.type === "error") return AlertTriangle;
  if (toastState.type === "warning") return AlertTriangle;
  return Info;
});

const ariaRole = computed(() =>
  toastState.type === "error" ? "alert" : "status"
);

const hasDetails = computed(() => Boolean(toastState.message || toastState.filePath));
</script>

<template>
  <Teleport to="body">
    <Transition name="app-toast">
      <div
        v-if="toastState.isOpen"
        ref="toastRef"
        class="app-toast"
        :class="[`is-${toastState.type}`, { 'is-multiline': hasDetails }]"
        :role="ariaRole"
        :aria-live="toastState.type === 'error' ? 'assertive' : 'polite'"
        @mouseenter="pauseToast('pointer')"
        @mouseleave="resumeToast('pointer')"
        @focusin="pauseToast('focus')"
        @focusout="handleFocusOut"
      >
        <span class="toast-icon">
          <component :is="toastIcon" :size="16" />
        </span>
        <div class="toast-content">
          <div class="toast-title">{{ toastState.title }}</div>
          <p v-if="toastState.message" class="toast-message">
            {{ toastState.message }}
          </p>
          <div v-if="toastState.filePath" class="toast-file">
            <p class="toast-path" :title="toastState.filePath">{{ toastState.filePath }}</p>
            <button
              type="button"
              class="toast-copy"
              :title="pathCopied ? '已复制路径' : '复制文件路径'"
              :aria-label="pathCopied ? '已复制文件路径' : '复制文件路径'"
              @click="handleCopyPath"
            >
              <Check v-if="pathCopied" :size="13" aria-hidden="true" />
              <Copy v-else :size="13" aria-hidden="true" />
            </button>
          </div>
          <p v-if="copyFailed" class="toast-copy-error" role="status">
            复制失败，可选中路径手动复制
          </p>
        </div>
        <button
          type="button"
          class="toast-close"
          title="关闭提示"
          aria-label="关闭提示"
          @click="hideToast"
        >
          <X :size="13" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.app-toast {
  position: fixed;
  top: 16px;
  left: 50%;
  z-index: 10100;
  display: flex;
  align-items: center;
  gap: 9px;
  width: fit-content;
  min-width: 240px;
  max-width: min(92vw, 560px);
  padding: 10px 11px 10px 12px;
  transform: translateX(-50%);
  background: var(--bg-popover);
  border: 1px solid rgba(var(--accent-rgb), 0.32);
  border-radius: 10px;
  box-shadow: var(--shadow-popover);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);

  &.is-multiline {
    align-items: flex-start;
  }

  &.is-success {
    border-color: rgba(16, 185, 129, 0.36);

    .toast-icon {
      color: var(--success-text);
      background: rgba(16, 185, 129, 0.12);
    }
  }

  &.is-error {
    border-color: rgba(239, 68, 68, 0.38);

    .toast-icon {
      color: var(--danger-text);
      background: rgba(239, 68, 68, 0.12);
    }
  }

  &.is-warning {
    border-color: rgba(245, 158, 11, 0.38);

    .toast-icon {
      color: var(--warning-text);
      background: rgba(245, 158, 11, 0.12);
    }
  }

  &.is-info {
    .toast-icon {
      color: var(--accent-text);
      background: rgba(var(--accent-rgb), 0.12);
    }
  }
}

.toast-icon {
  flex-shrink: 0;
  width: 25px;
  height: 25px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
}

.toast-content {
  flex: 1;
  min-width: 0;
  user-select: text;
}

.app-toast.is-multiline .toast-content {
  padding-top: 1px;
}

.toast-title {
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
}

.toast-message {
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.toast-file {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 6px;
  padding: 4px 5px;
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.toast-path {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  word-break: break-word;
  user-select: text;
}

.toast-copy-error {
  margin-top: 4px;
  color: var(--warning-text);
  font-size: 11px;
  line-height: 1.5;
}

.toast-close,
.toast-copy {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    color: var(--text-body);
    background: var(--overlay-soft);
  }
}

.toast-close:focus-visible,
.toast-copy:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.app-toast-enter-active,
.app-toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px) scale(0.98);
}
</style>
