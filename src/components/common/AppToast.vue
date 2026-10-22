<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, CheckCircle2, Info, X } from "@lucide/vue";
import { useToast } from "../../composables/useToast";

const { toastState, hideToast } = useToast();

const toastIcon = computed(() => {
  if (toastState.type === "success") return CheckCircle2;
  if (toastState.type === "error") return AlertTriangle;
  if (toastState.type === "warning") return AlertTriangle;
  return Info;
});

const ariaRole = computed(() =>
  toastState.type === "error" ? "alert" : "status"
);

const hasMessage = computed(() => Boolean(toastState.message));
</script>

<template>
  <Teleport to="body">
    <Transition name="app-toast">
      <div
        v-if="toastState.isOpen"
        class="app-toast"
        :class="[`is-${toastState.type}`, { 'is-multiline': hasMessage }]"
        :role="ariaRole"
        :aria-live="toastState.type === 'error' ? 'assertive' : 'polite'"
      >
        <span class="toast-icon">
          <component :is="toastIcon" :size="16" />
        </span>
        <div class="toast-content">
          <div class="toast-title">{{ toastState.title }}</div>
          <p v-if="toastState.message" class="toast-message">
            {{ toastState.message }}
          </p>
        </div>
        <button
          type="button"
          class="toast-close"
          title="关闭提示"
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
  background: rgba(9, 14, 26, 0.97);
  border: 1px solid rgba(99, 102, 241, 0.32);
  border-radius: 10px;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.62), 0 0 20px rgba(99, 102, 241, 0.12);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);

  &.is-multiline {
    align-items: flex-start;
  }

  &.is-success {
    border-color: rgba(16, 185, 129, 0.36);

    .toast-icon {
      color: #34d399;
      background: rgba(16, 185, 129, 0.12);
    }
  }

  &.is-error {
    border-color: rgba(239, 68, 68, 0.38);

    .toast-icon {
      color: #f87171;
      background: rgba(239, 68, 68, 0.12);
    }
  }

  &.is-warning {
    border-color: rgba(245, 158, 11, 0.38);

    .toast-icon {
      color: #fbbf24;
      background: rgba(245, 158, 11, 0.12);
    }
  }

  &.is-info {
    .toast-icon {
      color: #a5b4fc;
      background: rgba(99, 102, 241, 0.12);
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
}

.app-toast.is-multiline .toast-content {
  padding-top: 1px;
}

.toast-title {
  color: #f1f5f9;
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1.35;
}

.toast-message {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 0.7rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.toast-close {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #64748b;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.06);
  }
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
