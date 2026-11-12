<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import type { PelicanHistoryItem } from "../../types";
import { formatHistoryTime } from "../../utils/pelicanFormatters";
import { Info, Copy, Download, X } from "@lucide/vue";
import { useClipboard } from "../../composables/useClipboard";
import { useToast } from "../../composables/useToast";
import { usePopoverPin } from "./usePopoverPin";
import HistoryEmptyState from "./HistoryEmptyState.vue";
import HistoryDetailPopover from "./HistoryDetailPopover.vue";
import {
  resolvePelicanContentType,
  buildPelicanPreviewDocument,
} from "../pelican/pelicanPreview";
import { usePelicanTestStore } from "../../stores";

const props = defineProps<{
  pelicanList: PelicanHistoryItem[];
  applyDisabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "apply", item: PelicanHistoryItem): void;
  (e: "delete", id: string): void;
}>();

const { copy: copyText } = useClipboard();
const { showToast } = useToast();
const { pinnedId, togglePin } = usePopoverPin();
const pelicanStore = usePelicanTestStore();
const popoverPlacementMap = ref<Record<string, "top" | "bottom">>({});

const gridContainerRef = ref<HTMLElement | null>(null);
const stageWidth = ref(360);

const stagePreviewScale = computed(() => {
  // 基准画布视口为 800px × 600px (4:3)，根据卡片实际像素宽度等比缩放
  const scale = stageWidth.value / 800;
  return Number.isFinite(scale) && scale > 0 ? scale : 0.45;
});

const containerStyle = computed(() => ({
  "--stage-preview-scale": String(stagePreviewScale.value),
}));

function updateStageWidth(): void {
  if (!gridContainerRef.value) return;
  const firstStage = gridContainerRef.value.querySelector<HTMLElement>(".image-stage");
  if (firstStage) {
    const rect = firstStage.getBoundingClientRect();
    if (rect.width > 0) {
      stageWidth.value = rect.width;
      return;
    }
  }
  const containerW = gridContainerRef.value.getBoundingClientRect().width;
  if (containerW > 0) {
    stageWidth.value = containerW > 640 ? (containerW - 16) / 2 : containerW;
  }
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  nextTick(() => {
    updateStageWidth();
  });
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      updateStageWidth();
    });
    if (gridContainerRef.value) {
      resizeObserver.observe(gridContainerRef.value);
    }
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

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

function handleApply(item: PelicanHistoryItem): void {
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

function handleDownloadPelican(item: PelicanHistoryItem): void {
  const isHtml =
    resolvePelicanContentType(item.contentType, item.content) === "html";
  const mimeType = isHtml
    ? "text/html;charset=utf-8"
    : "image/svg+xml;charset=utf-8";
  const ext = isHtml ? "html" : "svg";
  const blob = new Blob([item.content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const cleanModel = (item.modelName || "model").replace(
    /[^a-zA-Z0-9_-]/g,
    "_"
  );
  const fileName = `pelican-${cleanModel}-${item.createdAt}.${ext}`;
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast({
    type: "success",
    title: "下载完成",
    message: fileName,
    duration: 3000,
  });
}

async function handleCopyPelican(item: PelicanHistoryItem): Promise<void> {
  const copied = await copyText(item.content);
  showToast(
    copied
      ? { type: "success", title: "已复制图形代码", duration: 2000 }
      : {
          type: "error",
          title: "复制失败",
          message: "请检查剪贴板权限后重试",
          duration: 3000,
        }
  );
}
</script>

<template>
  <div
    ref="gridContainerRef"
    class="pelican-history-container"
    :style="containerStyle"
  >
    <!-- 空状态 -->
    <HistoryEmptyState v-if="pelicanList.length === 0" type="pelican" />

    <!-- 两列布局的图片网格 -->
    <div v-else class="pelican-history-grid">
      <article
        v-for="item in pelicanList"
        :key="item.id"
        class="pelican-card-item"
        :class="{ 'is-pinned-card': pinnedId === item.id }"
      >
        <!-- 1. 图片展示区域（纯原生矢量 SVG 等比居中展示，HTML 按 800x600 等比缩放微缩展示） -->
        <div
          class="image-stage"
          :class="{
            'is-apply-disabled': applyDisabled,
            'is-html-stage': resolvePelicanContentType(item.contentType, item.content) === 'html',
          }"
          @click="handleApply(item)"
          title="点击将此图片载入主界面查看"
        >
          <!-- 允许动态脚本运行；不授予同源权限，避免脚本访问主界面 -->
          <iframe
            class="preview-frame"
            :class="{
              'is-svg-frame': resolvePelicanContentType(item.contentType, item.content) === 'svg',
              'is-html-frame': resolvePelicanContentType(item.contentType, item.content) === 'html',
              'svg-frame': true,
            }"
            :srcdoc="buildPelicanPreviewDocument(item, pelicanStore.bgTheme)"
            sandbox="allow-scripts allow-same-origin"
            scrolling="no"
            loading="lazy"
            tabindex="-1"
            :title="`${item.modelName} 鹈鹕测试预览`"
          ></iframe>
        </div>

        <!-- 2. 左上角显示调用模型名（通透半透明，无 icon） -->
        <div class="model-tag" :title="item.modelName">
          <span class="model-tag-text">{{ item.modelName }}</span>
        </div>

        <!-- 3. 右上角信息 icon 与详细信息浮层 -->
        <div
          class="info-icon-wrapper"
          :class="{ 'is-pinned': pinnedId === item.id }"
          @mouseenter="handleWrapperMouseEnter(item.id, $event)"
        >
          <button
            type="button"
            class="info-action-btn"
            :class="{ 'is-pinned': pinnedId === item.id }"
            aria-label="查看详细参数"
            :title="pinnedId === item.id ? '取消固定详情面板' : '点击固定详情面板'"
            @click.stop="handleTogglePin(item.id, $event)"
          >
            <Info :size="14" />
          </button>

          <!-- Hover/固定 详细信息浮层 -->
          <HistoryDetailPopover
            :item="item"
            :is-pinned="pinnedId === item.id"
            :placement="popoverPlacementMap[item.id] || 'bottom'"
          />
        </div>

        <!-- 4. 浮于图片上方的底栏快捷操作（默认隐藏，hover 时显现） -->
        <footer class="card-footer" @click.stop>
          <span class="time-label">{{ formatHistoryTime(item.createdAt) }}</span>
          <div class="footer-btns">
            <button
              type="button"
              class="tool-btn"
              title="复制图形代码"
              @click.stop="handleCopyPelican(item)"
            >
              <Copy :size="12" />
            </button>
            <button
              type="button"
              class="tool-btn"
              title="下载图片文件"
              @click.stop="handleDownloadPelican(item)"
            >
              <Download :size="12" />
            </button>
            <button
              type="button"
              class="tool-btn delete-tool-btn"
              title="删除此条记录"
              @click.stop="emit('delete', item.id)"
            >
              <X :size="12" />
            </button>
          </div>
        </footer>
      </article>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.pelican-history-container {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  flex: 1;
}

/* 鹈鹕两列图片网格 */
.pelican-history-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}

/* 单张卡片项：固定接近 4:3 比例，占满整张卡片，多出裁剪，不拉伸变形 */
.pelican-card-item {
  position: relative;
  z-index: 1;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  aspect-ratio: 4 / 3;
  overflow: visible; /* 保证 hover 浮层正常弹出不被裁切 */
  transition: all 0.22s ease;
  display: block;

  &:hover,
  &:focus-within,
  &:has(.info-tooltip-popover:hover) {
    z-index: 15;
    border-color: rgba(var(--accent-rgb), 0.45);
  }

  &.is-pinned-card {
    z-index: 80;
    border-color: rgba(var(--accent-rgb), 0.65);

    .info-icon-wrapper {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }
  }
}

/* 左上角模型名：更通透半透明，无 icon，默认显示 */
.model-tag {
  height: 20px;
  line-height: 20px;
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  padding: 0 9px;
  border-radius: 9999px;
  background: var(--pelican-tag-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--pelican-tag-border);
  color: var(--pelican-tag-color);
  font-size: 11px;
  font-weight: 500;
  box-shadow: var(--pelican-tag-shadow);
  max-width: 65%;
  pointer-events: none; /* 穿透不遮挡图片点击 */
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;

  .model-tag-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* 右上角信息 icon 与 Hover 详细信息浮层：鹈鹕卡片专属绝对定位 */
.pelican-card-item .info-icon-wrapper {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 25;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-3px);
  transition: opacity 0.2s ease, transform 0.2s ease;

  .info-action-btn {
    opacity: 0.8;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--pelican-floating-btn-bg);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid var(--pelican-floating-btn-border);
    color: var(--pelican-floating-btn-color);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: var(--pelican-floating-btn-shadow);
    transition: all 0.2s ease;

    &:hover,
    &:focus {
      opacity: 1;
      color: var(--pelican-floating-btn-hover-color);
      border-color: var(--pelican-floating-btn-hover-border);
      background: var(--pelican-floating-btn-hover-bg);
      transform: scale(1.08);
    }

    &.is-pinned {
      background: var(--pelican-floating-pinned-bg) !important;
      border-color: var(--pelican-floating-pinned-border) !important;
      color: var(--pelican-floating-pinned-color) !important;
      opacity: 1 !important;
      box-shadow: 0 0 10px rgba(var(--accent-rgb), 0.35);
    }
  }

  &:hover :deep(.info-tooltip-popover),
  &:focus-within :deep(.info-tooltip-popover),
  &.is-pinned :deep(.info-tooltip-popover) {
    display: block;
    pointer-events: auto;
  }
}

/* 鹈鹕卡片 hover 时展示右上角详情 icon */
.pelican-card-item:hover .info-icon-wrapper,
.pelican-card-item .info-icon-wrapper:focus-within {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

/* 图片展示主舞台：占满整张卡片全部，内部裁切溢出，SVG 充满且保持宽高比不拉伸变形 */
.image-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: calc(var(--radius-md) - 1px);
  overflow: hidden;
  background: var(--bg-pelican-stage);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease;

  &.is-apply-disabled {
    cursor: not-allowed;
  }

  .preview-frame,
  .svg-frame {
    border: 0;
    display: block;
    background: transparent;
    pointer-events: none;

    &.is-svg-frame,
    &:not(.is-html-frame) {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    &.is-html-frame {
      position: absolute;
      top: 0;
      left: 0;
      width: 800px;
      height: 600px;
      transform-origin: 0 0;
      transform: scale(var(--stage-preview-scale, 0.45));
    }
  }
}

/* 卡片底栏操作区：贴底自然多阶羽化渐变过渡，彻底消除生硬截断线 */
.card-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 36px 12px 10px;
  background: var(--pelican-footer-bg);
  /* 移除硬截断模糊 backdrop-filter，使渐变如空气般平滑融解进插画中 */
  border-bottom-left-radius: calc(var(--radius-md) - 1px);
  border-bottom-right-radius: calc(var(--radius-md) - 1px);
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.22s cubic-bezier(0.16, 1, 0.3, 1),
              background 0.2s ease;

  .time-label {
    font-size: 11px;
    line-height: 1;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: var(--pelican-footer-text);
    text-shadow: var(--pelican-footer-text-shadow);
    font-weight: 500;
    letter-spacing: -0.2px;
    user-select: none;
    white-space: nowrap;
  }

  .footer-btns {
    display: flex;
    align-items: center;
    gap: 5px;

    .tool-btn {
      width: 24px;
      height: 24px;
      border-radius: var(--radius-sm);
      background: var(--pelican-footer-btn-bg);
      border: 1px solid var(--pelican-footer-btn-border);
      color: var(--pelican-footer-btn-color);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      transition: all 0.16s ease;

      &:hover {
        background: var(--pelican-footer-btn-hover-bg);
        border-color: var(--pelican-footer-btn-hover-border);
        color: var(--pelican-footer-btn-hover-color);
        transform: translateY(-1px);
      }

      &:active {
        transform: translateY(0) scale(0.92);
      }

      &.delete-tool-btn:hover {
        background: var(--pelican-footer-btn-delete-bg);
        border-color: var(--pelican-footer-btn-delete-border);
        color: var(--pelican-footer-btn-delete-color);
        transform: translateY(-1px);
      }
    }
  }
}

/* 卡片 hover 或内部聚焦时平滑显示底栏 */
.pelican-card-item:hover .card-footer,
.pelican-card-item:focus-within .card-footer {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
</style>
