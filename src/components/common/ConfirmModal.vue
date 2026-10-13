<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import {
  useConfirm,
  type ConfirmType,
  type ConfirmStyleVariant,
  type ConfirmButtonVariant,
} from "../../composables/useConfirm";

const { confirmState, handleConfirm: stateConfirm, handleCancel: stateCancel } = useConfirm();

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    title?: string;
    message?: string;
    type?: ConfirmType;
    styleVariant?: ConfirmStyleVariant;
    confirmText?: string;
    cancelText?: string;
    confirmButtonVariant?: ConfirmButtonVariant;
    cancelButtonVariant?: ConfirmButtonVariant;
    highlightTag?: string;
    detailList?: string[];
    showCancel?: boolean;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
    loading?: boolean;
    useGlobalState?: boolean;
  }>(),
  {
    isOpen: undefined,
    title: undefined,
    message: undefined,
    type: undefined,
    styleVariant: undefined,
    confirmText: undefined,
    cancelText: undefined,
    confirmButtonVariant: undefined,
    cancelButtonVariant: undefined,
    highlightTag: undefined,
    detailList: undefined,
    showCancel: undefined,
    closeOnBackdrop: undefined,
    closeOnEsc: undefined,
    loading: undefined,
    useGlobalState: true,
  }
);

const emit = defineEmits<{
  (e: "confirm"): void;
  (e: "cancel"): void;
  (e: "close"): void;
  (e: "update:isOpen", value: boolean): void;
}>();

// 计算最终属性值：优先使用 props，若未传则回退到全局 useConfirm 状态
const visible = computed(() => {
  if (props.isOpen !== undefined) return props.isOpen;
  return props.useGlobalState ? confirmState.isOpen : false;
});

const currentType = computed<ConfirmType>(() => {
  return props.type ?? (props.useGlobalState ? confirmState.type : "warning") ?? "warning";
});

const currentStyleVariant = computed<ConfirmStyleVariant>(() => {
  return props.styleVariant ?? (props.useGlobalState ? confirmState.styleVariant : "spotlight") ?? "spotlight";
});

const currentTitle = computed<string>(() => {
  if (props.title !== undefined) return props.title;
  if (props.useGlobalState && confirmState.title) return confirmState.title;
  switch (currentType.value) {
    case "danger":
      return "危险操作确认";
    case "warning":
      return "确认操作";
    case "success":
      return "操作确认";
    default:
      return "提示与确认";
  }
});

const currentMessage = computed<string>(() => {
  if (props.message !== undefined) return props.message;
  return props.useGlobalState ? confirmState.message ?? "" : "";
});

const currentConfirmText = computed<string>(() => {
  if (props.confirmText !== undefined) return props.confirmText;
  return (props.useGlobalState ? confirmState.confirmText : "确定") || "确定";
});

const currentCancelText = computed<string>(() => {
  if (props.cancelText !== undefined) return props.cancelText;
  return (props.useGlobalState ? confirmState.cancelText : "取消") || "取消";
});

const currentHighlightTag = computed<string>(() => {
  if (props.highlightTag !== undefined) return props.highlightTag;
  return (props.useGlobalState ? confirmState.highlightTag : "") || "";
});

const isShowCancel = computed<boolean>(() => {
  if (props.showCancel !== undefined) return props.showCancel;
  return props.useGlobalState ? confirmState.showCancel !== false : true;
});

const isCloseOnBackdrop = computed<boolean>(() => {
  if (props.closeOnBackdrop !== undefined) return props.closeOnBackdrop;
  return props.useGlobalState ? confirmState.closeOnBackdrop !== false : true;
});

const isCloseOnEsc = computed<boolean>(() => {
  if (props.closeOnEsc !== undefined) return props.closeOnEsc;
  return props.useGlobalState ? confirmState.closeOnEsc !== false : true;
});

const isLoading = computed<boolean>(() => {
  if (props.loading !== undefined) return props.loading;
  return props.useGlobalState ? confirmState.loading : false;
});

// 计算确认按钮类名
const confirmBtnClass = computed(() => {
  const customVariant = props.confirmButtonVariant ?? (props.useGlobalState ? confirmState.confirmButtonVariant : undefined);
  if (customVariant) {
    return `btn-${customVariant}`;
  }
  switch (currentType.value) {
    case "danger":
      return "btn-danger";
    case "warning":
      return "btn-warning";
    case "success":
      return "btn-success";
    default:
      return "btn-primary";
  }
});

function onConfirm(): void {
  if (isLoading.value) return;
  emit("confirm");
  emit("update:isOpen", false);
  if (props.useGlobalState) {
    stateConfirm();
  }
}

function onCancel(): void {
  if (isLoading.value) return;
  emit("cancel");
  emit("close");
  emit("update:isOpen", false);
  if (props.useGlobalState) {
    stateCancel();
  }
}

function onBackdropClick(): void {
  if (isCloseOnBackdrop.value) {
    onCancel();
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (!visible.value) return;
  if (e.key === "Escape" && isCloseOnEsc.value) {
    e.preventDefault();
    onCancel();
  } else if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    const target = e.target as HTMLElement | null;
    // 避免在 textarea 或 input 中按回车时误触弹窗确认
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) {
      return;
    }
    e.preventDefault();
    onConfirm();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="confirm-modal-backdrop"
      @click.self="onBackdropClick"
    >
      <div
        class="confirm-modal-dialog"
        :class="[
          `type-${currentType}`,
          `variant-${currentStyleVariant}`,
        ]"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'confirm-dialog-title'"
      >
        <!-- 弹窗顶栏：左标题 + 右关闭按钮（图2结构，深色系质感） -->
        <div class="confirm-header">
          <div class="title-wrap">
            <h3 id="confirm-dialog-title" class="dialog-title">
              <slot name="title">{{ currentTitle }}</slot>
            </h3>
            <span v-if="currentHighlightTag" class="highlight-tag">
              {{ currentHighlightTag }}
            </span>
          </div>

          <button
            type="button"
            class="btn-close"
            title="关闭 (Esc)"
            @click="onCancel"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- 弹窗主体：左图标 + 右说明正文（图2左右排版，移除多余细则说明框） -->
        <div class="confirm-body">
          <!-- 左侧警示图标 -->
          <div class="icon-col" :class="`icon-${currentType}`">
            <slot name="icon">
              <!-- Warning Icon (图2同款明黄警示三角) -->
              <svg
                v-if="currentType === 'warning'"
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="#f59e0b"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>

              <!-- Danger Icon (危险警示三角) -->
              <svg
                v-else-if="currentType === 'danger'"
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="#ef4444"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>

              <!-- Success Icon -->
              <svg
                v-else-if="currentType === 'success'"
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="#10b981"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="16 9 10 15 8 13" />
              </svg>

              <!-- Info / Default Icon -->
              <svg
                v-else
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="#38bdf8"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </slot>
          </div>

          <!-- 右侧正文描述 -->
          <div class="content-col">
            <div class="dialog-message" v-if="currentMessage || $slots.default">
              <slot>{{ currentMessage }}</slot>
            </div>
          </div>
        </div>

        <!-- 底部操作按钮组：右对齐精致按钮（严格等高 32px，像素级一致） -->
        <div class="confirm-footer">
          <slot name="footer">
            <button
              v-if="isShowCancel"
              type="button"
              class="btn btn-cancel"
              :disabled="isLoading"
              @click="onCancel"
            >
              {{ currentCancelText }}
            </button>
            <button
              type="button"
              class="btn"
              :class="confirmBtnClass"
              :disabled="isLoading"
              @click="onConfirm"
            >
              <span v-if="isLoading" class="btn-spinner"></span>
              <span>{{ currentConfirmText }}</span>
            </button>
          </slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
/* 遮罩背景 */
.confirm-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 7, 13, 0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 16px;
  animation: fadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 弹窗主体卡片 (项目纯正深色系 + 桌面紧凑经典排版) */
.confirm-modal-dialog {
  position: relative;
  background: #101726;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  padding: 18px 20px 16px;
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.04);
  animation: modalScaleUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

/* 弹窗顶栏 */
.confirm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;

  .title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dialog-title {
    font-size: 15px;
    font-weight: 600;
    color: #f8fafc;
    margin: 0;
    line-height: 1.4;
    letter-spacing: -0.01em;
  }

  .highlight-tag {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #94a3b8;
  }

  .btn-close {
    background: transparent;
    border: none;
    padding: 4px;
    border-radius: 4px;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;

    &:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.08);
    }
  }
}

/* 弹窗主体：左图标 + 右说明正文 */
.confirm-body {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;

  .icon-col {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 2px;

    svg {
      display: block;
      width: 22px;
      height: 22px;
    }
  }

  .content-col {
    flex: 1;
    min-width: 0;
  }

  .dialog-message {
    font-size: 13.5px;
    color: #94a3b8;
    line-height: 1.55;
    word-break: break-word;
  }
}

/* 底部操作按钮组（右对齐，严格等高 32px） */
.confirm-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;

  .btn {
    box-sizing: border-box;
    height: 32px;
    min-width: 72px;
    padding: 0 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    transition: all 0.15s ease;
    border: 1px solid transparent; // 统一 1px 边框基准，彻底消除边框导致的高度差！
    outline: none;

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  /* 取消按钮（深色沉浸中性灰） */
  .btn-cancel {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #cbd5e1;

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.22);
      color: #ffffff;
    }

    &:active:not(:disabled) {
      background: rgba(255, 255, 255, 0.08);
    }
  }

  /* 确认重置 / 警告按钮（饱满橙黄，高度与取消严格一致） */
  .btn-warning {
    background: #f59e0b;
    border: 1px solid #f59e0b;
    color: #ffffff;

    &:hover:not(:disabled) {
      background: #d97706;
      border-color: #d97706;
    }

    &:active:not(:disabled) {
      background: #b45309;
      border-color: #b45309;
    }
  }

  /* 危险操作按钮（绯红） */
  .btn-danger {
    background: #ef4444;
    border: 1px solid #ef4444;
    color: #ffffff;

    &:hover:not(:disabled) {
      background: #dc2626;
      border-color: #dc2626;
    }

    &:active:not(:disabled) {
      background: #b91c1c;
      border-color: #b91c1c;
    }
  }

  /* 成功操作按钮（翡翠绿） */
  .btn-success {
    background: #10b981;
    border: 1px solid #10b981;
    color: #ffffff;

    &:hover:not(:disabled) {
      background: #059669;
      border-color: #059669;
    }

    &:active:not(:disabled) {
      background: #047857;
      border-color: #047857;
    }
  }

  /* 主要操作按钮（靛青蓝） */
  .btn-primary {
    background: #6366f1;
    border: 1px solid #6366f1;
    color: #ffffff;

    &:hover:not(:disabled) {
      background: #4f46e5;
      border-color: #4f46e5;
    }

    &:active:not(:disabled) {
      background: #4338ca;
      border-color: #4338ca;
    }
  }

  .btn-ghost {
    background: transparent;
    color: #94a3b8;
    border: 1px solid rgba(255, 255, 255, 0.12);

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
    }
  }

  .btn-spinner {
    width: 13px;
    height: 13px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
