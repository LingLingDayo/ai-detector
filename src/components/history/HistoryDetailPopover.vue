<script setup lang="ts">
import type {
  CandyHistoryItem,
  PelicanHistoryItem,
  ProbeHistoryItem,
} from "../../types";
import {
  formatReasoningEffort,
  formatHistoryTime,
} from "../../utils/pelicanFormatters";
import { formatDurationMs } from "../../utils/connectionMetrics";

const props = withDefaults(
  defineProps<{
    item: PelicanHistoryItem | ProbeHistoryItem | CandyHistoryItem;
    isPinned?: boolean;
    placement?: "top" | "bottom";
  }>(),
  {
    isPinned: false,
    placement: "bottom",
  }
);

function isProbeItem(
  target: PelicanHistoryItem | ProbeHistoryItem | CandyHistoryItem
): target is ProbeHistoryItem {
  return "predictionName" in target;
}

function isCandyItem(
  target: PelicanHistoryItem | ProbeHistoryItem | CandyHistoryItem
): target is CandyHistoryItem {
  return "diagnostics" in target && "passed" in target;
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

      <!-- 糖果测试特有字段 -->
      <div v-if="isCandyItem(item)" class="popover-item">
        <span class="item-label">测试结论</span>
        <span
          class="item-value"
          :class="item.passed ? 'winner-highlight' : ''"
        >
          {{ item.passed ? "测试通过" : "未通过" }} ({{ item.correctCount }}/{{ item.totalCount }})
        </span>
      </div>

      <div v-if="isCandyItem(item)" class="popover-item">
        <span class="item-label">平均耗时</span>
        <span class="item-value font-mono">
          {{ formatDurationMs(item.avgDurationMs) }}
        </span>
      </div>

      <!-- 测试时间 / 生成时间 -->
      <div v-if="item.createdAt" class="popover-item">
        <span class="item-label">{{
          isProbeItem(item) || isCandyItem(item) ? "测试时间" : "生成时间"
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
  background: var(--bg-popover);
  border: 1px solid rgba(var(--accent-rgb), 0.38);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-popover);
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
    background: rgba(var(--accent-rgb), 0.45);
    color: #ffffff;
  }

  .popover-header {
    padding-bottom: 8px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--overlay-medium);

    .popover-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-body);
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
    font-size: 12px;

    .item-label {
      color: var(--text-secondary);
      flex-shrink: 0;
      user-select: text;
      cursor: text;
    }

    .item-value {
      color: var(--text-strong);
      text-align: right;
      word-break: break-all;
      user-select: text;
      cursor: text;

      &.config-name-badge {
        color: var(--accent-text);
        font-weight: 600;
        background: rgba(var(--accent-rgb), 0.15);
        padding: 1px 6px;
        border-radius: 4px;
        user-select: text;
        cursor: text;
      }

      &.model-highlight {
        color: var(--accent-sky);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          monospace;
        user-select: text;
        cursor: text;
      }

      &.winner-highlight {
        color: var(--success-text);
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
