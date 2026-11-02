<script setup lang="ts">
import { ref } from "vue";
import type { CandyHistoryItem } from "../../types";
import { formatHistoryTime } from "../../utils/pelicanFormatters";
import { formatDurationMs } from "../../utils/connectionMetrics";
import { Info, Copy, X } from "@lucide/vue";
import { useClipboard } from "../../composables/useClipboard";
import { useToast } from "../../composables/useToast";
import { usePopoverPin } from "./usePopoverPin";
import HistoryEmptyState from "./HistoryEmptyState.vue";
import HistoryDetailPopover from "./HistoryDetailPopover.vue";

const props = defineProps<{
  candyList: CandyHistoryItem[];
  applyDisabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "apply", item: CandyHistoryItem): void;
  (e: "delete", id: string): void;
}>();

const { copy: copyText } = useClipboard();
const { showToast } = useToast();
const { pinnedId, togglePin } = usePopoverPin();
const popoverPlacementMap = ref<Record<string, "top" | "bottom">>({});

function getPlacement(id: string, index: number): "top" | "bottom" {
  if (popoverPlacementMap.value[id]) {
    return popoverPlacementMap.value[id];
  }
  const total = props.candyList?.length || 0;
  if (total >= 3 && index >= total - 2) {
    return "top";
  }
  return "bottom";
}

function updatePlacement(id: string, targetEl: HTMLElement): void {
  const rect = targetEl.getBoundingClientRect();
  const modalBody = targetEl.closest(".modal-body") || document.body;
  const containerRect = modalBody.getBoundingClientRect();
  const spaceBelow = containerRect.bottom - rect.bottom;
  const spaceAbove = rect.top - containerRect.top;

  if (spaceBelow < 250 && spaceAbove > 180) {
    popoverPlacementMap.value[id] = "top";
  } else {
    popoverPlacementMap.value[id] = "bottom";
  }
}

function handleWrapperMouseEnter(id: string, e: MouseEvent): void {
  const currentTarget = e.currentTarget as HTMLElement | null;
  if (currentTarget) {
    updatePlacement(id, currentTarget);
  }
}

function handleApply(item: CandyHistoryItem): void {
  if (props.applyDisabled) return;
  emit("apply", item);
}

function handleTogglePin(id: string, e: Event): void {
  const target = (e.currentTarget || e.target) as HTMLElement | null;
  const wrapper = target?.closest(".info-icon-wrapper") as HTMLElement | null;
  if (wrapper) {
    updatePlacement(id, wrapper);
  }
  togglePin(id, e);
}

async function handleCopyCandySummary(item: CandyHistoryItem): Promise<void> {
  const acc = (item.accuracy * 100).toFixed(1);
  const verdict = item.passed ? "测试通过" : "测试未通过";
  const details = (item.diagnostics || [])
    .map(
      (d) =>
        `第${d.index + 1}题: 答案 ${d.expectedAnswer} / 模型答 ${d.modelAnswer ?? "未识别"} (${d.isCorrect ? "✓" : "✗"})`
    )
    .join(" · ");
  const text = `【糖果测试诊断结果】\n调用模型: ${item.modelName}\n测试结论: ${verdict} (${item.correctCount}/${item.totalCount}，准确率 ${acc}%)\n答题明细: ${details}\n平均耗时: ${formatDurationMs(item.avgDurationMs)}\n测试时间: ${formatHistoryTime(item.createdAt)}`;
  const copied = await copyText(text);
  showToast(
    copied
      ? { type: "success", title: "已复制糖果测试结果", duration: 2000 }
      : {
          type: "error",
          title: "复制失败",
          message: "请检查剪贴板权限后重试",
          duration: 3000,
        }
  );
}

function getBadgeClass(item: CandyHistoryItem): string {
  if (item.correctCount >= item.totalCount) return "prob-high";
  if (item.passed) return "prob-mid";
  return "prob-low";
}
</script>

<template>
  <div class="candy-history-container">
    <HistoryEmptyState v-if="candyList.length === 0" type="candy" />

    <div v-else class="candy-history-list">
      <div
        v-for="(item, index) in candyList"
        :key="item.id"
        class="candy-row-item"
        :class="{
          'is-pinned-row': pinnedId === item.id,
          'is-apply-disabled': applyDisabled,
        }"
        title="点击将此糖果测试结果与题目详情载入主界面查看"
        @click="handleApply(item)"
      >
        <!-- 左侧核心结果：调用模型 -> 通过状态与各题明细 -->
        <div class="candy-row-main">
          <span class="call-name" :title="`调用模型: ${item.modelName}`">
            {{ item.modelName }}
          </span>
          <span class="row-arrow">→</span>
          <span
            class="verdict-name"
            :class="item.passed ? 'is-pass' : 'is-fail'"
          >
            {{ item.passed ? "测试通过" : "未通过" }} ({{ item.correctCount }}/{{ item.totalCount }})
          </span>

          <div class="step-mini-pills">
            <span
              v-for="d in item.diagnostics"
              :key="d.index"
              class="mini-pill"
              :class="d.isCorrect ? 'pill-ok' : 'pill-err'"
              :title="`第 ${d.index + 1} 题: 正确答案 ${d.expectedAnswer}，模型回答 ${d.modelAnswer ?? '未识别'}`"
            >
              #{{ d.index + 1 }}: {{ d.modelAnswer ?? "?" }}/{{ d.expectedAnswer }}
            </span>
          </div>
        </div>

        <!-- 右侧信息与操作 -->
        <div class="candy-row-meta" @click.stop>
          <span class="prob-tag" :class="getBadgeClass(item)">
            {{ (item.accuracy * 100).toFixed(0) }}%
          </span>
          <span class="time-tag">{{ formatHistoryTime(item.createdAt) }}</span>

          <div class="row-action-group">
            <div
              class="info-icon-wrapper"
              :class="{ 'is-pinned': pinnedId === item.id }"
              @mouseenter="handleWrapperMouseEnter(item.id, $event)"
            >
              <button
                type="button"
                class="row-action-btn"
                :class="{ 'is-pinned': pinnedId === item.id }"
                aria-label="查看详细参数"
                :title="pinnedId === item.id ? '取消固定详情面板' : '点击固定详情面板'"
                @click.stop="handleTogglePin(item.id, $event)"
              >
                <Info :size="13" />
              </button>

              <HistoryDetailPopover
                :item="item"
                :is-pinned="pinnedId === item.id"
                :placement="getPlacement(item.id, index)"
              />
            </div>

            <button
              type="button"
              class="row-action-btn"
              title="复制测试结果"
              @click="handleCopyCandySummary(item)"
            >
              <Copy :size="12" />
            </button>

            <button
              type="button"
              class="row-action-btn delete-btn"
              title="删除记录"
              @click="emit('delete', item.id)"
            >
              <X :size="12" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.candy-history-container {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  flex: 1;
}

.candy-history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.candy-row-item {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover,
  &:focus-within,
  &:has(.info-tooltip-popover:hover) {
    z-index: 15;
    background: var(--bg-control);
    border-color: rgba(99, 102, 241, 0.35);
    box-shadow: var(--shadow-hover);

    .candy-row-meta .row-action-btn {
      opacity: 0.95;
    }
  }

  &.is-pinned-row {
    z-index: 80;
    background: var(--bg-control-strong);
    border-color: rgba(99, 102, 241, 0.6);
    box-shadow: var(--shadow-hover);

    .candy-row-meta .row-action-btn {
      opacity: 0.95;
    }
  }

  &.is-apply-disabled {
    cursor: not-allowed;
  }

  .candy-row-main {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;

    .call-name {
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: var(--text-secondary);
      background: var(--overlay-soft);
      border: 1px solid var(--overlay-soft);
      padding: 1px 6px;
      border-radius: 4px;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .row-arrow {
      color: var(--text-muted);
      font-size: 12px;
      user-select: none;
      flex-shrink: 0;
    }

    .verdict-name {
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;

      &.is-pass {
        color: var(--success-text);
      }

      &.is-fail {
        color: var(--danger-text);
      }
    }

    .step-mini-pills {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow: hidden;

      .mini-pill {
        font-size: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        padding: 1px 5px;
        border-radius: 3px;
        white-space: nowrap;

        &.pill-ok {
          color: var(--success-text);
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
        }

        &.pill-err {
          color: var(--danger-text);
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
        }
      }
    }
  }

  .candy-row-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;

    .prob-tag {
      font-size: 12px;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid transparent;

      &.prob-high {
        background: rgba(16, 185, 129, 0.14);
        border-color: rgba(16, 185, 129, 0.3);
        color: var(--success-text);
      }

      &.prob-mid {
        background: rgba(99, 102, 241, 0.14);
        border-color: rgba(99, 102, 241, 0.3);
        color: var(--accent-text);
      }

      &.prob-low {
        background: rgba(239, 68, 68, 0.14);
        border-color: rgba(239, 68, 68, 0.3);
        color: var(--danger-text);
      }
    }

    .time-tag {
      font-size: 11px;
      color: var(--text-muted);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    .row-action-group {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;

      .row-action-btn {
        width: 24px;
        height: 24px;
        border-radius: 4px;
        background: var(--overlay-weak);
        border: 1px solid var(--overlay-medium);
        color: var(--text-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0.7;
        transition: all 0.18s ease;

        &:hover {
          background: var(--overlay-strong);
          color: var(--text-strong);
          border-color: var(--border-subtle);
          opacity: 1;
        }

        &.delete-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.4);
          color: var(--danger-text);
        }

        &.is-pinned {
          background: rgba(99, 102, 241, 0.3) !important;
          border-color: rgba(99, 102, 241, 0.65) !important;
          color: var(--accent-text) !important;
          opacity: 1 !important;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
        }
      }

      .info-icon-wrapper {
        position: relative;
        z-index: 2;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;

        &:hover,
        &:focus-within,
        &.is-pinned {
          z-index: 10;
        }

        &:hover :deep(.info-tooltip-popover),
        &:focus-within :deep(.info-tooltip-popover),
        &.is-pinned :deep(.info-tooltip-popover) {
          display: block;
          pointer-events: auto;
        }
      }
    }
  }
}
</style>
