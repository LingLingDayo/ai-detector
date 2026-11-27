<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    placement: "bottom" | "top";
    id?: string;
    modelValue: string;
    models: string[];
    isFetchedFromApi: boolean;
    isFetching?: boolean;
  }>(),
  {
    isFetching: false,
  }
);

const emit = defineEmits<{
  (e: "select", model: string): void;
}>();

function handleSelect(model: string): void {
  emit("select", model);
}
</script>

<template>
  <div
    class="model-dropdown-menu"
    :class="{ hidden: !isOpen, 'is-top': placement === 'top', 'is-bottom': placement === 'bottom' }"
    :id="id ? `${id}-dropdown` : 'model-dropdown'"
  >
    <ul class="dropdown-list" :id="id ? `${id}-dropdown-list` : 'dropdown-list'">
      <template v-if="models.length === 0">
        <li v-if="isFetching" class="dropdown-empty">
          正在拉取模型列表...
        </li>
        <li v-else-if="isFetchedFromApi" class="dropdown-empty">
          上游未返回可用模型，可直接在上方手动输入测试模型 ID
        </li>
        <li v-else class="dropdown-empty">
          <div style="font-weight: 500; margin-bottom: 4px; color: var(--text-secondary)">尚未拉取模型列表</div>
          <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">
            请先配置 Base URL 与 API Key 后点击右侧 ↻ 按钮在线拉取，亦可直接手动输入。
          </div>
        </li>
      </template>
      <template v-else>
        <li
          v-for="m in models"
          :key="m"
          class="dropdown-item"
          :class="{ selected: m === modelValue }"
          @click="handleSelect(m)"
        >
          <span class="model-name-text">{{ m }}</span>
          <span v-if="m === modelValue" class="selected-check">✓</span>
        </li>
      </template>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.model-dropdown-menu {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1000;
  background: var(--bg-popover);
  border: 1px solid rgba(var(--accent-rgb), 0.35);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
  max-height: 230px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: fadeIn 0.15s ease-out;

  &.is-bottom {
    top: calc(100% + 4px);
    bottom: auto;
  }

  &.is-top {
    bottom: calc(100% + 4px);
    top: auto;
  }

  .dropdown-list {
    list-style: none;
    overflow-y: auto;
    max-height: 220px;
    padding: 4px 0;
    scrollbar-width: thin;
    scrollbar-color: rgba(var(--accent-rgb), 0.28) transparent;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(var(--accent-rgb), 0.28);
      border-radius: 10px;

      &:hover {
        background: rgba(var(--accent-rgb), 0.55);
      }
    }

    .dropdown-item {
      padding: 6px 10px;
      font-size: 13px;
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background var(--transition-fast), color var(--transition-fast);
      border-radius: var(--radius-sm);
      margin: 1px 4px;
      user-select: none;

      .model-name-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
        flex: 1;
      }

      .selected-check {
        font-size: 12px;
        color: var(--accent-primary);
        flex-shrink: 0;
        margin-left: 6px;
      }

      &:hover,
      &.active {
        background: rgba(var(--accent-rgb), 0.15);
        color: var(--text-strong);
      }

      &.selected {
        color: var(--accent-primary);
        font-weight: 600;
      }
    }

    .dropdown-empty {
      padding: 12px;
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
    }
  }
}
</style>
