<script setup lang="ts">
import type { ActiveTestMode } from "../../types";

defineProps<{
  activeMode: ActiveTestMode;
  probeRunning: boolean;
  pelicanRunning: boolean;
  connectionRunning: boolean;
}>();

const emit = defineEmits<{
  (e: "change", mode: ActiveTestMode): void;
}>();
</script>

<template>
  <div class="test-mode-tabs" role="tablist">
    <button
      type="button"
      class="tab-item"
      :class="{ active: activeMode === 'probe', 'is-running': probeRunning }"
      role="tab"
      :aria-selected="activeMode === 'probe'"
      title="三道随机题目探测，并在统一库中比对模型归因（仅匹配候选库内已收录模型，未收录模型仍会被归到最相似的现有候选）"
      @click="emit('change', 'probe')"
    >
      <span>模型测试</span>
      <span v-if="probeRunning" class="tab-running-dot" title="模型测试进行中"></span>
    </button>

    <span class="tab-divider" aria-hidden="true"></span>

    <button
      type="button"
      class="tab-item"
      :class="{ active: activeMode === 'pelican', 'is-running': pelicanRunning }"
      role="tab"
      :aria-selected="activeMode === 'pelican'"
      title="生成自行车鹈鹕 SVG 矢量图，直观测试模型是否降智"
      @click="emit('change', 'pelican')"
    >
      <span>鹈鹕测试</span>
      <span v-if="pelicanRunning" class="tab-running-dot" title="鹈鹕测试进行中"></span>
    </button>

    <span class="tab-divider" aria-hidden="true"></span>

    <button
      type="button"
      class="tab-item"
      :class="{ active: activeMode === 'connection', 'is-running': connectionRunning }"
      role="tab"
      :aria-selected="activeMode === 'connection'"
      title="多轮自由对话，支持图片输入，并实时核对上游实际响应模型"
      @click="emit('change', 'connection')"
    >
      <span>连接测试</span>
      <span v-if="connectionRunning" class="tab-running-dot" title="连接测试进行中"></span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.test-mode-tabs {
  display: flex;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 2px;
  gap: 2px;
  margin-top: 1px;

  .tab-divider {
    flex: 0 0 1px;
    width: 1px;
    height: 12px;
    align-self: center;
    border-radius: 1px;
    background: rgba(148, 163, 184, 0.22);
    pointer-events: none;
  }

  .tab-item {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3.5px 8px;
    border-radius: calc(var(--radius-sm) - 2px);
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-secondary);
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1.25;
    cursor: pointer;
    transition: all var(--transition-fast);
    font-family: inherit;

    &:hover:not(:disabled):not(.active) {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.04);
    }

    &.active {
      background: rgba(99, 102, 241, 0.2);
      border-color: rgba(99, 102, 241, 0.5);
      color: #ffffff;
      font-weight: 600;
      box-shadow: 0 1px 6px rgba(99, 102, 241, 0.2);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .tab-running-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--accent-primary, #6366f1);
      margin-left: 6px;
      box-shadow: 0 0 8px rgba(99, 102, 241, 0.85);
      animation: pulse-dot 1.4s infinite ease-in-out;
      flex-shrink: 0;
    }
  }
}

@keyframes pulse-dot {
  0%, 100% {
    transform: scale(0.9);
    opacity: 0.7;
    box-shadow: 0 0 4px rgba(99, 102, 241, 0.6);
  }
  50% {
    transform: scale(1.35);
    opacity: 1;
    box-shadow: 0 0 10px rgba(99, 102, 241, 1);
  }
}
</style>
