<script setup lang="ts">
import { ref } from "vue";
import { AlertTriangle, Unlock } from "@lucide/vue";
import DataVaultKeyInput from "./DataVaultKeyInput.vue";

const props = defineProps<{
  isUnlocking: boolean;
  error: string;
}>();

const emit = defineEmits<{
  (e: "unlock", key: string): void;
}>();

const keyInput = ref("");

function submitUnlock(): void {
  if (props.isUnlocking) return;
  emit("unlock", keyInput.value);
}
</script>

<template>
  <div class="unlock-body">
    <div class="unlock-icon">
      <Unlock :size="20" />
    </div>
    <div class="unlock-title">请输入加密密钥以解锁备份</div>
    <div class="unlock-desc">此文件设置了自定义密钥，解密后可预览并勾选要导入的数据</div>

    <div class="unlock-form">
      <DataVaultKeyInput
        v-model="keyInput"
        placeholder="输入导出时设置的密钥"
        autocomplete="off"
        @enter="submitUnlock"
      />

      <button
        type="button"
        class="primary-action-btn unlock-btn"
        :disabled="isUnlocking"
        @click="submitUnlock"
      >
        <span v-if="isUnlocking" class="btn-spinner"></span>
        <span>{{ isUnlocking ? "解密中..." : "解密" }}</span>
      </button>
    </div>

    <div v-if="error" class="unlock-error">
      <AlertTriangle :size="13" />
      <span>{{ error }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.unlock-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-inset);
}

.unlock-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent-icon);
}

.unlock-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.unlock-desc {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

.unlock-form {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 340px;
  margin-top: 6px;
}

.primary-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent-gradient);
  color: var(--accent-contrast);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--accent-btn-shadow);
  transition: all var(--transition-fast);
  flex-shrink: 0;

  &:hover:not(:disabled) {
    opacity: 0.94;
    box-shadow: var(--accent-btn-shadow-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
}

.unlock-btn {
  height: 30px;
  padding: 0 14px;
}

.unlock-error {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--danger-text);
}
</style>
