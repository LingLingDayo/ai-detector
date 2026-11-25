<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import { Check, FolderPlus, X } from "@lucide/vue";
import { useToast } from "../../composables/useToast";

const emit = defineEmits<{
  (e: "confirm", name: string): void;
  (e: "cancel"): void;
}>();

const { showToast } = useToast();

const groupName = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  nextTick(() => {
    inputRef.value?.focus();
  });
});

function handleConfirm(): void {
  const trimmed = groupName.value.trim();
  if (!trimmed) {
    showToast({
      type: "warning",
      title: "请输入分组名称",
      duration: 2000,
    });
    inputRef.value?.focus();
    return;
  }
  emit("confirm", trimmed);
  groupName.value = "";
}

function handleCancel(): void {
  groupName.value = "";
  emit("cancel");
}

function handleBlur(): void {
  const trimmed = groupName.value.trim();
  if (!trimmed) {
    handleCancel();
    return;
  }
  handleConfirm();
}
</script>

<template>
  <div class="create-group-inline-card">
    <div class="create-group-icon">
      <FolderPlus :size="15" />
    </div>
    <input
      ref="inputRef"
      v-model="groupName"
      type="text"
      class="create-group-input"
      placeholder="输入新分组名称，按 Enter 创建..."
      maxlength="40"
      @blur="handleBlur"
      @keydown.enter.prevent="handleConfirm"
      @keydown.esc.stop.prevent="handleCancel"
    />
    <div class="create-group-actions">
      <button
        type="button"
        class="btn-inline btn-confirm"
        title="确认创建 (Enter)"
        @mousedown.prevent
        @click="handleConfirm"
      >
        <Check :size="14" />
      </button>
      <button
        type="button"
        class="btn-inline btn-cancel"
        title="取消 (Esc)"
        @mousedown.prevent
        @click="handleCancel"
      >
        <X :size="14" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.create-group-inline-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-panel);
  border: 1px solid rgba(var(--accent-rgb), 0.45);
  border-radius: var(--radius-md);
  box-shadow: 0 0 0 2px var(--border-glow);

  .create-group-icon {
    color: var(--accent-icon);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .create-group-input {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 10px;
    font-size: 13px;
    color: var(--text-primary);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    outline: none;

    &:focus {
      border-color: var(--accent-primary);
    }

    &::placeholder {
      color: var(--text-placeholder);
    }
  }

  .create-group-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;

    .btn-inline {
      width: 24px;
      height: 24px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all var(--transition-fast);
      border: 1px solid transparent;

      svg {
        display: block;
        flex-shrink: 0;
      }

      &.btn-confirm {
        color: var(--success-text);
        background: var(--success-bg);
        border-color: var(--success-border);

        &:hover {
          background: rgba(16, 185, 129, 0.22);
        }
      }

      &.btn-cancel {
        background: var(--bg-control);
        border-color: var(--border-subtle);
        color: var(--text-secondary);

        &:hover {
          background: var(--bg-control-hover);
          color: var(--text-strong);
        }
      }
    }
  }
}
</style>
