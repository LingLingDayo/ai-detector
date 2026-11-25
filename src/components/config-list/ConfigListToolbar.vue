<script setup lang="ts">
import { Search, X, Save, ChevronsUpDown, ChevronsDownUp } from "@lucide/vue";

withDefaults(
  defineProps<{
    modelValue: string;
    canSaveCurrent?: boolean;
    hasGroups?: boolean;
    allCollapsed?: boolean;
  }>(),
  {
    canSaveCurrent: false,
    hasGroups: false,
    allCollapsed: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "openSaveCurrent"): void;
  (e: "toggleAllGroups"): void;
}>();
</script>

<template>
  <div class="list-toolbar-wrapper">
    <div class="list-toolbar">
      <div class="search-input-wrapper">
        <Search class="search-icon" :size="14" />
        <input
          type="text"
          :value="modelValue"
          placeholder="搜索配置名称、分组、URL、模型..."
          class="search-input"
          @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="modelValue"
          type="button"
          class="btn-clear-search"
          title="清空搜索"
          @click="emit('update:modelValue', '')"
        >
          <X :size="12" :stroke-width="2.5" />
        </button>
      </div>

      <button
        v-if="hasGroups"
        type="button"
        class="btn-collapse-all"
        :title="allCollapsed ? '展开全部分组' : '折叠全部分组'"
        @click="emit('toggleAllGroups')"
      >
        <ChevronsUpDown v-if="allCollapsed" :size="14" />
        <ChevronsDownUp v-else :size="14" />
        <span>{{ allCollapsed ? "展开全部" : "折叠全部" }}</span>
      </button>

      <button
        v-if="canSaveCurrent"
        type="button"
        class="btn-save-current"
        @click="emit('openSaveCurrent')"
        title="将主界面当前输入的参数保存为一条新配置"
      >
        <Save :size="14" />
        <span>保存为新配置</span>
      </button>
    </div>

    <!-- 为后续复杂多维筛选预留的独立扩展槽 -->
    <div v-if="$slots.filters" class="toolbar-filters-row">
      <slot name="filters" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.list-toolbar-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-panel-strong);
  flex-shrink: 0;
}

.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;

  .search-input-wrapper {
    position: relative;
    flex: 1;
    min-width: 200px;
    display: flex;
    align-items: center;

    .search-icon {
      position: absolute;
      left: 10px;
      color: var(--text-muted);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      height: 32px;
      padding: 0 28px 0 30px;
      font-size: 12px;
      background: var(--bg-input);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      outline: none;
      transition: all var(--transition-fast);

      &:focus {
        border-color: var(--accent-primary);
        box-shadow: 0 0 0 2px var(--border-glow);
      }

      &::placeholder {
        color: var(--text-placeholder);
      }
    }

    .btn-clear-search {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 3px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-sm);
      transition: color var(--transition-fast);

      svg {
        display: block;
        flex-shrink: 0;
      }

      &:hover {
        color: var(--text-strong);
      }
    }
  }

  .btn-collapse-all {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 32px;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    font-family: inherit;
    color: var(--text-secondary);
    background: var(--bg-surface-control);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;

    svg {
      display: block;
      flex-shrink: 0;
    }

    &:hover {
      color: var(--accent-text);
      background: var(--bg-surface-control-hover);
      border-color: var(--border-surface-control-hover);
    }

    &:active {
      background: var(--bg-surface-control-active);
    }
  }

  .btn-save-current {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 32px;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    font-family: inherit;
    color: var(--info-text);
    background: rgba(var(--info-rgb), 0.12);
    border: 1px solid rgba(var(--info-rgb), 0.28);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;

    svg {
      display: block;
      flex-shrink: 0;
    }

    &:hover {
      background: rgba(var(--info-rgb), 0.22);
      border-color: rgba(var(--info-rgb), 0.5);
      color: var(--info-text-soft);
    }
  }
}

.toolbar-filters-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}
</style>
