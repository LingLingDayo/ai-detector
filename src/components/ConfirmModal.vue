<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import {
  useConfirm,
  type ConfirmType,
  type ConfirmStyleVariant,
  type ConfirmButtonVariant,
} from "../composables/useConfirm";

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

const currentDetailList = computed<string[]>(() => {
  if (props.detailList !== undefined) return props.detailList;
  return props.useGlobalState ? confirmState.detailList ?? [] : [];
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
        <!-- 风格2：顶部横幅装饰线 -->
        <div v-if="currentStyleVariant === 'banner'" class="top-accent-bar"></div>

        <!-- 主内容区域 -->
        <div class="confirm-content-wrapper">
          <!-- 图标徽章 -->
          <div class="icon-wrapper" :class="`icon-${currentType}`">
            <slot name="icon">
              <!-- Warning Icon -->
              <svg
                v-if="currentType === 'warning'"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>

              <!-- Danger Icon -->
              <svg
                v-else-if="currentType === 'danger'"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 9v4M12 17h.01M5.07 19h13.86a2 2 0 0 0 1.74-2.98L13.74 4.5a2 2 0 0 0-3.48 0L3.33 16.02A2 2 0 0 0 5.07 19z" />
              </svg>

              <!-- Success Icon -->
              <svg
                v-else-if="currentType === 'success'"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>

              <!-- Info / Default Icon -->
              <svg
                v-else
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </slot>
          </div>

          <!-- 文本与说明区 -->
          <div class="text-container">
            <div class="title-row">
              <h3 id="confirm-dialog-title" class="dialog-title">
                <slot name="title">{{ currentTitle }}</slot>
              </h3>
              <span v-if="currentHighlightTag" class="highlight-tag">
                {{ currentHighlightTag }}
              </span>
            </div>

            <div class="dialog-message" v-if="currentMessage || $slots.default">
              <slot>{{ currentMessage }}</slot>
            </div>

            <!-- 风格3/附带细则列表 (detail) -->
            <div
              v-if="currentDetailList.length > 0 || $slots.detail"
              class="confirm-detail-box"
            >
              <slot name="detail">
                <div class="detail-header">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>本次操作影响范围：</span>
                </div>
                <ul class="detail-list">
                  <li v-for="(item, idx) in currentDetailList" :key="idx" class="detail-item">
                    <span class="detail-bullet"></span>
                    <span>{{ item }}</span>
                  </li>
                </ul>
              </slot>
            </div>
          </div>
        </div>

        <!-- 底部操作按钮组 -->
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
  background: rgba(4, 7, 13, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 16px;
  animation: fadeIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 弹窗主体 */
.confirm-modal-dialog {
  position: relative;
  background: #0f1623;
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.04);
  animation: modalScaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  transition: all var(--transition-normal);
}

/* --------------------------------------------------------------------------
   语义主题风格配色 (Types: warning / danger / info / success)
   -------------------------------------------------------------------------- */

/* Warning 警告主题 (琥珀黄) */
.type-warning {
  .icon-warning {
    background: rgba(245, 158, 11, 0.12);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }
  .top-accent-bar {
    background: #f59e0b;
  }
}

/* Danger 危险主题 (绯红色) */
.type-danger {
  .icon-danger {
    background: rgba(239, 68, 68, 0.12);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }
  .top-accent-bar {
    background: #ef4444;
  }
}

/* Info 信息/常规主题 (科技靛青) */
.type-info {
  .icon-info {
    background: rgba(99, 102, 241, 0.12);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.25);
  }
  .top-accent-bar {
    background: #6366f1;
  }
}

/* Success 成功主题 (翡翠绿) */
.type-success {
  .icon-success {
    background: rgba(16, 185, 129, 0.12);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }
  .top-accent-bar {
    background: #10b981;
  }
}

/* 顶部横幅线条 */
.top-accent-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 2;
}

/* --------------------------------------------------------------------------
   视觉形态风格 (Style Variants: spotlight / banner / detail / minimal)
   -------------------------------------------------------------------------- */

/* 1. 聚光灯居中风格 (默认 spotlight) */
.variant-spotlight {
  .confirm-content-wrapper {
    padding: 24px 22px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    position: relative;
    z-index: 2;
  }

  .icon-wrapper {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
    flex-shrink: 0;
  }

  .title-row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }

  .dialog-title {
    font-size: 1.05rem;
    font-weight: 600;
    color: #fff;
    letter-spacing: -0.01em;
  }

  .dialog-message {
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .confirm-footer {
    padding: 12px 22px 20px;
    display: flex;
    gap: 10px;
    justify-content: center;
    position: relative;
    z-index: 2;

    .btn {
      flex: 1;
      padding: 9px 16px;
      font-size: 0.88rem;
    }
  }
}

/* 2. 横幅工整左右风格 (banner) */
.variant-banner {
  .confirm-content-wrapper {
    padding: 20px 20px 14px;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 14px;
    position: relative;
    z-index: 2;
  }

  .icon-wrapper {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .text-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .dialog-title {
    font-size: 0.98rem;
    font-weight: 600;
    color: #fff;
  }

  .dialog-message {
    font-size: 0.83rem;
    color: var(--text-secondary);
    line-height: 1.45;
  }

  .confirm-footer {
    padding: 12px 20px 16px;
    background: rgba(0, 0, 0, 0.18);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    justify-content: flex-end;
    gap: 10px;

    .btn {
      min-width: 84px;
      padding: 7px 14px;
      font-size: 0.84rem;
    }
  }
}

/* 3. 详细细则/影响范围卡片风格 (detail) */
.variant-detail {
  max-width: 480px;

  .confirm-content-wrapper {
    padding: 22px 22px 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    position: relative;
    z-index: 2;
  }

  .icon-wrapper {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    flex-shrink: 0;
  }

  .title-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }

  .dialog-title {
    font-size: 1.02rem;
    font-weight: 600;
    color: #fff;
  }

  .dialog-message {
    font-size: 0.84rem;
    color: var(--text-secondary);
    line-height: 1.45;
    margin-bottom: 12px;
  }

  .confirm-detail-box {
    width: 100%;
    background: rgba(14, 20, 31, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    text-align: left;
    margin-top: 4px;
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  .detail-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .detail-item {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    font-size: 0.78rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .detail-bullet {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--text-muted);
    margin-top: 6px;
    flex-shrink: 0;
  }

  .confirm-footer {
    padding: 12px 22px 18px;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    position: relative;
    z-index: 2;

    .btn {
      flex: 1;
      padding: 8px 16px;
      font-size: 0.86rem;
    }
  }
}

/* 4. 极简清爽紧凑风格 (minimal) */
.variant-minimal {
  max-width: 380px;

  .confirm-content-wrapper {
    padding: 18px 18px 12px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .icon-wrapper {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    svg {
      width: 18px;
      height: 18px;
    }
  }

  .text-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .dialog-title {
    font-size: 0.92rem;
    font-weight: 600;
    color: #fff;
  }

  .dialog-message {
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .confirm-footer {
    padding: 10px 18px 14px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;

    .btn {
      padding: 6px 12px;
      font-size: 0.82rem;
    }
  }
}

/* 标签徽章 */
.highlight-tag {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
}

/* --------------------------------------------------------------------------
   按钮样式
   -------------------------------------------------------------------------- */

.btn-cancel {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--text-secondary);

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.22);
    color: var(--text-primary);
  }
}

.btn-warning {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #fff;
  box-shadow: 0 3px 12px rgba(245, 158, 11, 0.35);

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%);
    box-shadow: 0 5px 16px rgba(245, 158, 11, 0.5);
    transform: translateY(-1px);
  }
}

.btn-danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: #fff;
  box-shadow: 0 3px 12px rgba(239, 68, 68, 0.35);

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #f87171 0%, #dc2626 100%);
    box-shadow: 0 5px 16px rgba(239, 68, 68, 0.5);
    transform: translateY(-1px);
  }
}

.btn-success {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  box-shadow: 0 3px 12px rgba(16, 185, 129, 0.35);

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #34d399 0%, #059669 100%);
    box-shadow: 0 5px 16px rgba(16, 185, 129, 0.5);
    transform: translateY(-1px);
  }
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);

  &:hover:not(:disabled) {
    color: var(--text-primary);
    border-color: var(--text-secondary);
  }
}
</style>
