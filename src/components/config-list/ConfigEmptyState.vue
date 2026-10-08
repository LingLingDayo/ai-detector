<script setup lang="ts">
defineProps<{
  searchQuery: string;
  canSaveCurrent?: boolean;
}>();

const emit = defineEmits<{
  (e: "openCreate"): void;
  (e: "openSaveCurrent"): void;
}>();
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    </div>
    <h4>{{ searchQuery ? "未找到匹配的配置" : "暂无已保存的配置" }}</h4>
    <p>
      {{
        searchQuery
          ? "请尝试使用其他关键词进行搜索"
          : canSaveCurrent
          ? "您可以将当前主表单的输入保存为新配置，或点击下方按钮添加配置"
          : "暂无预设配置，您可以点击下方按钮录入并添加新配置"
      }}
    </p>
    <div class="empty-actions">
      <button
        v-if="!searchQuery && canSaveCurrent"
        type="button"
        class="btn btn-secondary btn-sm"
        @click="emit('openSaveCurrent')"
      >
        保存当前输入为配置
      </button>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        @click="emit('openCreate')"
      >
        + 添加新配置
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 16px;
  text-align: center;
  color: var(--text-muted);
  gap: 8px;

  .empty-icon {
    color: #475569;
    margin-bottom: 4px;
  }

  h4 {
    font-size: 0.92rem;
    color: var(--text-secondary);
  }

  p {
    font-size: 0.76rem;
    max-width: 320px;
    line-height: 1.5;
  }

  .empty-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
}
</style>
