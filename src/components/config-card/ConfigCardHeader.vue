<script setup lang="ts">
import { Check, History, List, Save, Settings } from "@lucide/vue";

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
  (e: "open-settings"): void;
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
        <span>{{ isJustUpdated ? "已更新" : (isConfigModified ? "更新" : "保存") }}</span>
      </button>

      <button
        type="button"
        class="btn-header-action btn-history"
        id="btn-history"
        title="查看历史测试结果（模型测试、鹈鹕测试、连接测试）"
        @click="emit('open-history')"
      >
        <History :size="13" />
        <span>历史</span>
      </button>

      <button
        type="button"
        class="btn-header-action btn-config-list"
        id="btn-config-list"
        title="管理与切换已保存的配置预设列表"
        @click="emit('open-config-list')"
      >
        <List :size="13" />
        <span>配置</span>
      </button>

      <button
        type="button"
        class="btn-header-action btn-settings"
        id="btn-settings"
        title="打开设置"
        @click="emit('open-settings')"
      >
        <Settings :size="13" />
        <span>设置</span>
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
    font-size: 15px;
    font-weight: 600;
    color: var(--text-strong);
  }

  .active-config-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 9999px;
    background: rgba(var(--accent-rgb), 0.12);
    border: 1px solid rgba(var(--accent-rgb), 0.3);
    color: var(--accent-text);
    font-weight: 500;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    .active-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--accent-icon);
      box-shadow: 0 0 4px var(--accent-icon);
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
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: inherit;
    transition: all var(--transition-fast);
    background: var(--bg-control);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);

    svg {
      display: block;
      flex-shrink: 0;
    }

    &:hover {
      background: var(--bg-control-hover);
      border-color: rgba(var(--accent-rgb), 0.4);
      color: var(--text-primary);
    }

    &.btn-save-config {
      color: var(--info-text);
      background: rgba(var(--info-rgb), 0.08);
      border-color: rgba(var(--info-rgb), 0.22);

      &:hover:not(:disabled) {
        background: rgba(var(--info-rgb), 0.18);
        border-color: rgba(var(--info-rgb), 0.45);
        color: var(--info-text-soft);
      }

      &.btn-updated-success {
        color: var(--success-text);
        background: rgba(16, 185, 129, 0.15);
        border-color: rgba(16, 185, 129, 0.35);
        cursor: default;
      }
    }

    &.btn-config-list {
      color: var(--accent-text);
      background: rgba(var(--accent-rgb), 0.1);
      border-color: rgba(var(--accent-rgb), 0.25);
    }

    &.btn-history {
      color: var(--text-secondary);
      background: var(--bg-control);
      border-color: var(--border-subtle);

      .btn-count-dot {
        font-size: 10px;
        padding: 0 4px;
        height: 14px;
        line-height: 14px;
        border-radius: 9999px;
        background: rgba(var(--accent-rgb), 0.2);
        color: var(--accent-text);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
    }

    &.btn-config-list,
    &.btn-history,
    &.btn-settings {
      &:hover {
        background: rgba(var(--accent-rgb), 0.16);
        border-color: rgba(var(--accent-rgb), 0.42);
        color: var(--accent-text-contrast);
      }
    }
  }
}
</style>
