<script setup lang="ts">
import type { PelicanHistoryItem, ProbeHistoryItem } from "../../types";
import {
  formatReasoningEffort,
  formatHistoryTime,
} from "../../utils/pelicanFormatters";

const props = withDefaults(
  defineProps<{
    item: PelicanHistoryItem | ProbeHistoryItem;
    isPinned?: boolean;
    placement?: "top" | "bottom";
  }>(),
  {
    isPinned: false,
    placement: "bottom",
  }
);

function isProbeItem(
  target: PelicanHistoryItem | ProbeHistoryItem
): target is ProbeHistoryItem {
  return "predictionName" in target;
}

function formatProb(prob: number | undefined): string {
  if (prob === undefined || isNaN(prob)) return "0.0%";
  return `${(prob * 100).toFixed(1)}%`;
}
</script>

<template>
  <div
    class="info-tooltip-popover"
    :class="[
      `placement-${placement}`,
      { 'is-pinned': isPinned }
    ]"
    role="tooltip"
    @click.stop
  >
    <div class="popover-header">
      <span class="popover-title">测试参数详情</span>
    </div>
    <div class="popover-list">
      <!-- 配置名称（如果是保存的配置） -->
      <div v-if="item.configName" class="popover-item">
        <span class="item-label">配置名称</span>
        <span class="item-value config-name-badge">
          {{ item.configName }}
        </span>
      </div>

      <!-- Base URL -->
      <div class="popover-item">
        <span class="item-label">Base URL</span>
        <span
          class="item-value font-mono break-all selectable"
          :title="item.baseUrl"
        >
          {{ item.baseUrl }}
        </span>
      </div>

      <!-- API Key -->
      <div class="popover-item">
        <span class="item-label">API Key</span>
        <span class="item-value font-mono">{{ item.apiKey }}</span>
      </div>

      <!-- 调用模型 -->
      <div class="popover-item">
        <span class="item-label">调用模型</span>
        <span class="item-value model-highlight">{{ item.modelName }}</span>
      </div>

      <!-- 思考强度 -->
      <div class="popover-item">
        <span class="item-label">思考强度</span>
        <span class="item-value">
          {{ formatReasoningEffort(item.reasoningEffort) }}
        </span>
      </div>

      <!-- 探测模式特有字段：判定模型 -->
      <div v-if="isProbeItem(item)" class="popover-item">
        <span class="item-label">判定模型</span>
        <span class="item-value winner-highlight">
          {{ item.predictionName }} ({{ formatProb(item.probability) }})
        </span>
      </div>

      <!-- 探测模式特有字段：模型家族 -->
      <div
        v-if="isProbeItem(item) && item.familyPredictionName"
        class="popover-item"
      >
        <span class="item-label">模型家族</span>
        <span class="item-value">{{ item.familyPredictionName }}</span>
      </div>

      <!-- 测试时间 / 生成时间 -->
      <div v-if="item.createdAt" class="popover-item">
        <span class="item-label">{{
          isProbeItem(item) ? "测试时间" : "生成时间"
        }}</span>
        <span class="item-value text-muted">{{
          formatHistoryTime(item.createdAt)
        }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 详情面板弹出层动画与样式 */
@keyframes popoverFadeInDown {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes popoverFadeInUp {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.info-tooltip-popover {
  display: none;
  position: absolute;
  right: 0;
  width: 290px;
  background: #0f172a;
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: var(--radius-sm);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.85), 0 0 16px rgba(99, 102, 241, 0.25);
  padding: 12px;
  z-index: 100;
  user-select: text;
  cursor: default;
  animation-duration: 0.18s;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  animation-fill-mode: forwards;

  /* 默认向下弹出 */
  &.placement-bottom {
    top: calc(100% + 8px);
    bottom: auto;
    animation-name: popoverFadeInDown;

    &::before {
      content: "";
      position: absolute;
      top: -10px;
      bottom: auto;
      left: 0;
      right: 0;
      height: 10px;
    }
  }

  /* 向上自适应弹出 */
  &.placement-top {
    bottom: calc(100% + 8px);
    top: auto;
    animation-name: popoverFadeInUp;

    &::before {
      content: "";
      position: absolute;
      bottom: -10px;
      top: auto;
      left: 0;
      right: 0;
      height: 10px;
    }
  }

  &.is-pinned {
    display: block !important;
    pointer-events: auto;
  }

  &::selection,
  *::selection {
    background: rgba(99, 102, 241, 0.45);
    color: #ffffff;
  }

  .popover-header {
    padding-bottom: 8px;
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);

    .popover-title {
      font-size: 0.76rem;
      font-weight: 600;
      color: #e2e8f0;
      user-select: text;
      cursor: text;
    }
  }

  .popover-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .popover-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    font-size: 0.72rem;

    .item-label {
      color: var(--text-secondary);
      flex-shrink: 0;
      user-select: text;
      cursor: text;
    }

    .item-value {
      color: #f1f5f9;
      text-align: right;
      word-break: break-all;
      user-select: text;
      cursor: text;

      &.config-name-badge {
        color: #a5b4fc;
        font-weight: 600;
        background: rgba(99, 102, 241, 0.15);
        padding: 1px 6px;
        border-radius: 4px;
        user-select: text;
        cursor: text;
      }

      &.model-highlight {
        color: #38bdf8;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          monospace;
        user-select: text;
        cursor: text;
      }

      &.winner-highlight {
        color: #34d399;
        font-weight: 600;
        user-select: text;
        cursor: text;
      }

      &.font-mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          monospace;
        user-select: text;
        cursor: text;
      }

      &.selectable {
        user-select: text;
        cursor: text;
      }

      &.text-muted {
        color: var(--text-muted);
        user-select: text;
        cursor: text;
      }
    }
  }
}
</style>
