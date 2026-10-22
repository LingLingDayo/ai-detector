<script setup lang="ts">
import { Check, History, List, Save } from "@lucide/vue";

defineProps<{
  activeConfigName?: string;
  isCurrentConfigSaved: boolean;
  isConfigModified: boolean;
  isJustUpdated: boolean;
  isRunning: boolean;
}>();

const emit = defineEmits<{
  (e: "save"): void;
  (e: "open-config-list"): void;
  (e: "open-history"): void;
}>();
</script>

<template>
  <div class="card-header">
    <div class="header-title-group">
      <h2>探测参数配置</h2>
      <span
        v-if="activeConfigName"
        class="active-config-tag"
        :title="`当前应用配置：${activeConfigName}`"
      >
        <span class="active-dot"></span>
        {{ activeConfigName }}
      </span>
    </div>

    <div class="header-actions-group">
      <button
        v-if="!isCurrentConfigSaved || isJustUpdated"
        type="button"
        class="btn-header-action btn-save-config"
        :class="{ 'btn-updated-success': isJustUpdated }"
        id="btn-save-config"
        :title="
          isJustUpdated
            ? '配置已成功更新'
            : isConfigModified
            ? '将修改后的参数直接更新到配置预设'
            : '将当前填写的接口参数与密钥保存为配置预设'
        "
        :disabled="isRunning || isJustUpdated"
        @click="emit('save')"
      >
        <Check
          v-if="isJustUpdated"
          :size="13"
          :stroke-width="2.5"
        />
        <Save
          v-else
          :size="13"
        />
        <span>{{ isJustUpdated ? "已更新" : (isConfigModified ? "更新配置" : "保存配置") }}</span>
      </button>

      <button
        type="button"
        class="btn-header-action btn-config-list"
        id="btn-config-list"
        title="管理与切换已保存的配置预设列表"
        @click="emit('open-config-list')"
      >
        <List :size="13" />
        <span>配置列表</span>
      </button>

      <button
        type="button"
        class="btn-header-action btn-history"
        id="btn-history"
        title="查看历史测试结果（模型测试、鹈鹕测试、连接测试）"
        @click="emit('open-history')"
      >
        <History :size="13" />
        <span>历史记录</span>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.header-title-group {
  display: flex;
  align-items: center;
  gap: 8px;

  h2 {
    font-size: 0.94rem;
    font-weight: 600;
    color: #fff;
  }

  .active-config-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.68rem;
    padding: 1px 7px;
    border-radius: 9999px;
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.3);
    color: #a5b4fc;
    font-weight: 500;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    .active-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #818cf8;
      box-shadow: 0 0 4px #818cf8;
      flex-shrink: 0;
    }
  }
}

.header-actions-group {
  display: flex;
  align-items: center;
  gap: 6px;

  .btn-header-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    font-size: 0.74rem;
    font-weight: 500;
    line-height: 1;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: inherit;
    transition: all var(--transition-fast);
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);

    svg {
      display: block;
      flex-shrink: 0;
    }

    span {
      display: inline-flex;
      align-items: center;
      line-height: 1;
    }

    &:hover {
      background: rgba(30, 41, 59, 0.9);
      border-color: rgba(99, 102, 241, 0.4);
      color: var(--text-primary);
    }

    &.btn-save-config {
      color: #93c5fd;
      background: rgba(59, 130, 246, 0.08);
      border-color: rgba(59, 130, 246, 0.22);

      &:hover:not(:disabled) {
        background: rgba(59, 130, 246, 0.18);
        border-color: rgba(59, 130, 246, 0.45);
        color: #bfdbfe;
      }

      &.btn-updated-success {
        color: #34d399;
        background: rgba(16, 185, 129, 0.15);
        border-color: rgba(16, 185, 129, 0.35);
        cursor: default;
      }
    }

    &.btn-config-list {
      color: #c7d2fe;
      background: rgba(99, 102, 241, 0.1);
      border-color: rgba(99, 102, 241, 0.25);

      &:hover {
        background: rgba(99, 102, 241, 0.2);
        border-color: rgba(99, 102, 241, 0.5);
        color: #e0e7ff;
      }
    }

    &.btn-history {
      color: #cbd5e1;
      background: rgba(148, 163, 184, 0.08);
      border-color: rgba(148, 163, 184, 0.2);

      &:hover {
        background: rgba(99, 102, 241, 0.18);
        border-color: rgba(99, 102, 241, 0.45);
        color: #e0e7ff;
      }

      .btn-count-dot {
        font-size: 0.65rem;
        padding: 0 4px;
        height: 14px;
        line-height: 14px;
        border-radius: 9999px;
        background: rgba(99, 102, 241, 0.35);
        color: #c7d2fe;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
    }
  }
}
</style>
