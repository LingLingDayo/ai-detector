<script setup lang="ts">
import { Search, X, Save } from "@lucide/vue";

defineProps<{
  modelValue: string;
  canSaveCurrent?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "openSaveCurrent"): void;
}>();
</script>

<template>
  <div class="list-toolbar">
    <div class="search-input-wrapper">
      <Search class="search-icon" :size="14" />
      <input
        type="text"
        :value="modelValue"
        placeholder="搜索配置名称、URL、模型..."
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
      v-if="canSaveCurrent"
      type="button"
      class="btn-save-current"
      @click="emit('openSaveCurrent')"
      title="将主界面当前输入的参数保存为一条新配置"
    >
      <Save :size="13" />
      保存为新配置
    </button>
  </div>
</template>

<style lang="scss" scoped>
.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;

  .search-input-wrapper {
    position: relative;
    flex: 1;
    min-width: 200px;
    display: flex;
    align-items: center;

    .search-icon {
      position: absolute;
      left: 9px;
      color: var(--text-muted);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding: 5px 28px 5px 28px;
      font-size: 0.78rem;
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
        color: #475569;
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
        color: #fff;
      }
    }
  }

  .btn-save-current {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 26px;
    padding: 0 10px;
    font-size: 0.76rem;
    font-weight: 500;
    line-height: 1;
    color: #93c5fd;
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.28);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;

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
      background: rgba(59, 130, 246, 0.22);
      border-color: rgba(59, 130, 246, 0.5);
      color: #bfdbfe;
    }
  }
}
</style>
