<script setup lang="ts">
import { ref } from "vue";
import type { ProbeHistoryItem } from "../../types";
import { formatHistoryTime } from "../../utils/pelicanFormatters";
import { Info, Copy, X } from "@lucide/vue";
import { useClipboard } from "../../composables/useClipboard";
import { useToast } from "../../composables/useToast";
import { usePopoverPin } from "./usePopoverPin";
import HistoryEmptyState from "./HistoryEmptyState.vue";
import HistoryDetailPopover from "./HistoryDetailPopover.vue";

const props = defineProps<{
  probeList: ProbeHistoryItem[];
  applyDisabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "apply", item: ProbeHistoryItem): void;
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
  const total = props.probeList?.length || 0;
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

function handleApply(item: ProbeHistoryItem): void {
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

async function handleCopyProbeSummary(item: ProbeHistoryItem): Promise<void> {
  const prob = (item.probability * 100).toFixed(1);
  const text = `【模型测试诊断结果】\n调用模型: ${item.modelName}\n判定模型: ${item.predictionName} (${prob}%)\n模型家族: ${item.familyPredictionName || "通用系列"}\n有效样本: ${item.usedOutputs}/3\n测试时间: ${formatHistoryTime(item.createdAt)}`;
  const copied = await copyText(text);
  showToast(
    copied
      ? { type: "success", title: "已复制诊断结果", duration: 2000 }
      : {
          type: "error",
          title: "复制失败",
          message: "请检查剪贴板权限后重试",
          duration: 3000,
        }
  );
}

function formatProb(prob: number | undefined): string {
  if (prob === undefined || isNaN(prob)) return "0.0%";
  return `${(prob * 100).toFixed(1)}%`;
}

function getProbBadgeClass(prob: number | undefined): string {
  if (prob === undefined) return "prob-low";
  if (prob >= 0.8) return "prob-high";
  if (prob >= 0.5) return "prob-mid";
  return "prob-low";
}
</script>

<template>
  <div class="probe-history-container">
    <!-- 空状态 -->
    <HistoryEmptyState v-if="probeList.length === 0" type="probe" />

    <!-- 模型测试历史记录列表：紧凑、直观、极简极清爽 -->
    <div v-else class="probe-history-list">
      <div
        v-for="(item, index) in probeList"
        :key="item.id"
        class="probe-row-item"
        :class="{ 'is-pinned-row': pinnedId === item.id, 'is-apply-disabled': applyDisabled }"
        @click="handleApply(item)"
        title="点击将此诊断结果载入主界面查看"
      >
        <!-- 左侧核心结果：调用模型 -> 判定真身 -->
        <div class="probe-row-main">
          <span class="call-name" :title="`调用模型: ${item.modelName}`">{{ item.modelName }}</span>
          <span class="row-arrow">→</span>
          <span class="pred-name" :title="`判定真身: ${item.predictionName}（仅匹配候选库内已收录模型，未收录模型仍会被归到最相似的现有候选）`">{{ item.predictionName }}</span>
          <span v-if="item.familyPredictionName" class="family-tag">{{ item.familyPredictionName }}</span>
        </div>

        <!-- 右侧信息与操作：置信度、时间、详情 hover 浮层、复制、删除 -->
        <div class="probe-row-meta" @click.stop>
          <span class="prob-tag" :class="getProbBadgeClass(item.probability)">
            {{ formatProb(item.probability) }}
          </span>
          <span class="time-tag">{{ formatHistoryTime(item.createdAt) }}</span>

          <div class="row-action-group">
            <!-- 详情 hover/固定 icon 按钮 -->
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

              <!-- Hover/固定 详细信息浮层 -->
              <HistoryDetailPopover
                :item="item"
                :is-pinned="pinnedId === item.id"
                :placement="getPlacement(item.id, index)"
              />
            </div>

            <!-- 复制诊断文本按钮 -->
            <button
              type="button"
              class="row-action-btn"
              title="复制诊断结果"
              @click="handleCopyProbeSummary(item)"
            >
              <Copy :size="12" />
            </button>

            <!-- 删除单条记录按钮 -->
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
.probe-history-container {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  flex: 1;
}

.probe-history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.probe-row-item {
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
    border-color: rgba(var(--accent-rgb), 0.35);
    box-shadow: var(--shadow-hover);

    .probe-row-meta .row-action-btn {
      opacity: 0.95;
    }
  }

  &.is-pinned-row {
    z-index: 80;
    background: var(--bg-control-strong);
    border-color: rgba(var(--accent-rgb), 0.6);
    box-shadow: var(--shadow-hover);

    .probe-row-meta .row-action-btn {
      opacity: 0.95;
    }
  }

  &.is-apply-disabled {
    cursor: not-allowed;
  }

  /* 左侧核心：调用模型 -> 判定模型 (家族) */
  .probe-row-main {
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

    .pred-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-strong);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .family-tag {
      font-size: 10px;
      color: var(--accent-icon);
      background: rgba(var(--accent-rgb), 0.12);
      border: 1px solid rgba(var(--accent-rgb), 0.2);
      padding: 1px 5px;
      border-radius: 3px;
      white-space: nowrap;
      flex-shrink: 0;
    }
  }

  /* 右侧信息与操作 */
  .probe-row-meta {
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
        background: rgba(var(--accent-rgb), 0.14);
        border-color: rgba(var(--accent-rgb), 0.3);
        color: var(--accent-text);
      }

      &.prob-low {
        background: rgba(245, 158, 11, 0.14);
        border-color: rgba(245, 158, 11, 0.3);
        color: var(--warning-text);
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
          background: rgba(var(--accent-rgb), 0.3) !important;
          border-color: rgba(var(--accent-rgb), 0.65) !important;
          color: var(--accent-text) !important;
          opacity: 1 !important;
          box-shadow: 0 0 10px rgba(var(--accent-rgb), 0.4);
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
        opacity: 1;
        transform: none;
        pointer-events: auto;

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
