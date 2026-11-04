<script setup lang="ts">
import { ref } from "vue";
import type { PelicanHistoryItem } from "../../types";
import { formatHistoryTime } from "../../utils/pelicanFormatters";
import { Info, Copy, Download, X } from "@lucide/vue";
import { useClipboard } from "../../composables/useClipboard";
import { useToast } from "../../composables/useToast";
import { usePopoverPin } from "./usePopoverPin";
import HistoryEmptyState from "./HistoryEmptyState.vue";
import HistoryDetailPopover from "./HistoryDetailPopover.vue";

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
const popoverPlacementMap = ref<Record<string, "top" | "bottom">>({});

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
  const isHtml = item.contentType === "html";
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

function getPureSvgContent(rawContent: string): string {
  if (!rawContent) return "";
  const trimmed = rawContent.trim();
  const svgMatch = trimmed.match(/<svg[\s\S]*?<\/svg>/i);
  let svg = svgMatch ? svgMatch[0] : trimmed;

  // 保证 SVG 在充满裁剪时不拉伸变形：强制 preserveAspectRatio="xMidYMid slice"
  svg = svg.replace(/<svg\b([^>]*)>/i, (_match, attrs) => {
    let newAttrs = attrs;
    if (!/preserveAspectRatio=/i.test(newAttrs)) {
      newAttrs += ' preserveAspectRatio="xMidYMid slice"';
    } else {
      newAttrs = newAttrs.replace(
        /preserveAspectRatio=["'][^"']*["']/i,
        'preserveAspectRatio="xMidYMid slice"'
      );
    }
    return `<svg ${newAttrs}>`;
  });
  return svg;
}

function buildSvgPreviewDocument(rawContent: string): string {
  const svg = getPureSvgContent(rawContent);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    svg {
      width: 100% !important;
      height: 100% !important;
      display: block;
    }
  </style>
</head>
<body>${svg}</body>
</html>`;
}
</script>

<template>
  <div class="pelican-history-container">
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
        <!-- 1. 图片展示区域（纯原生矢量 SVG 渲染，占满卡片，自动裁剪且不拉伸变形） -->
        <div
          class="image-stage"
          :class="{ 'is-apply-disabled': applyDisabled }"
          @click="handleApply(item)"
          title="点击将此图片载入主界面查看"
        >
          <!-- 允许动态脚本运行；不授予同源权限，避免脚本访问主界面 -->
          <iframe
            class="svg-frame"
            :srcdoc="buildSvgPreviewDocument(item.content)"
            sandbox="allow-scripts"
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
        <footer class="card-footer">
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
    border-color: rgba(99, 102, 241, 0.45);
  }

  &.is-pinned-card {
    z-index: 80;
    border-color: rgba(99, 102, 241, 0.65);

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
      box-shadow: 0 0 10px rgba(99, 102, 241, 0.35);
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

  .svg-frame {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
    background: transparent;
    pointer-events: none;
  }
}

/* 卡片底栏操作区：浮在图片上方，默认隐藏，只有 hover 时才显示 */
.card-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 12px 10px;
  background: var(--pelican-footer-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom-left-radius: calc(var(--radius-md) - 1px);
  border-bottom-right-radius: calc(var(--radius-md) - 1px);
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition: opacity 0.2s ease, transform 0.2s ease, background 0.2s ease;

  .time-label {
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: var(--pelican-footer-text);
    text-shadow: var(--pelican-footer-text-shadow);
    font-weight: 500;
  }

  .footer-btns {
    display: flex;
    align-items: center;
    gap: 6px;

    .tool-btn {
      width: 24px;
      height: 24px;
      border-radius: var(--radius-sm);
      background: var(--pelican-floating-btn-bg);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      border: 1px solid var(--pelican-floating-btn-border);
      color: var(--pelican-floating-btn-color);
      box-shadow: var(--pelican-floating-btn-shadow);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.18s ease;

      &:hover {
        background: var(--pelican-floating-btn-hover-bg);
        border-color: var(--pelican-floating-btn-hover-border);
        color: var(--pelican-floating-btn-hover-color);
        transform: translateY(-1px);
      }

      &.delete-tool-btn:hover {
        background: var(--pelican-floating-btn-delete-bg);
        border-color: var(--pelican-floating-btn-delete-border);
        color: var(--pelican-floating-btn-delete-color);
        transform: translateY(-1px);
      }
    }
  }
}

/* 卡片 hover 时显示底栏 */
.pelican-card-item:hover .card-footer {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
</style>
