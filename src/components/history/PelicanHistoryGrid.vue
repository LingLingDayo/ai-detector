<script setup lang="ts">
import { ref } from "vue";
import type { PelicanHistoryItem } from "../../types";
import { formatHistoryTime } from "../../utils/pelicanFormatters";
import { Info, Copy, Download, X } from "@lucide/vue";
import { useClipboard } from "../../composables/useClipboard";
import { usePopoverPin } from "./usePopoverPin";
import HistoryEmptyState from "./HistoryEmptyState.vue";
import HistoryDetailPopover from "./HistoryDetailPopover.vue";

defineProps<{
  pelicanList: PelicanHistoryItem[];
}>();

const emit = defineEmits<{
  (e: "apply", item: PelicanHistoryItem): void;
  (e: "delete", id: string): void;
}>();

const { copy: copyText } = useClipboard();
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
  a.href = url;
  a.download = `pelican-${cleanModel}-${item.createdAt}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleCopyPelican(item: PelicanHistoryItem): void {
  copyText(item.content);
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
          @click="emit('apply', item)"
          title="点击将此图片载入主界面查看"
        >
          <div
            class="svg-viewport"
            v-html="getPureSvgContent(item.content)"
          ></div>
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
  background: #090e1a;
  border: 1px solid rgba(255, 255, 255, 0.08);
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
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
  }

  &.is-pinned-card {
    z-index: 80;
    border-color: rgba(99, 102, 241, 0.65);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);

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
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(241, 245, 249, 0.88);
  font-size: 0.68rem;
  font-weight: 500;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  max-width: 65%;
  pointer-events: none; /* 穿透不遮挡图片点击 */

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
    opacity: 0.5;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: rgba(17, 24, 39, 0.85);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    transition: all 0.2s ease;

    &:hover,
    &:focus {
      opacity: 1;
      color: #818cf8;
      border-color: rgba(99, 102, 241, 0.5);
      background: rgba(30, 41, 59, 0.95);
      transform: scale(1.08);
    }

    &.is-pinned {
      background: rgba(99, 102, 241, 0.3) !important;
      border-color: rgba(99, 102, 241, 0.65) !important;
      color: #a5b4fc !important;
      opacity: 1 !important;
      box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
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
  border-radius: var(--radius-md);
  overflow: hidden;
  background: radial-gradient(circle at center, #162035 0%, #090e1a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease;

  .svg-viewport {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;

    :deep(svg) {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4));
      user-select: none;
    }
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
  background: linear-gradient(
    to top,
    rgba(9, 14, 26, 0.94) 0%,
    rgba(9, 14, 26, 0.62) 65%,
    transparent 100%
  );
  border-bottom-left-radius: var(--radius-md);
  border-bottom-right-radius: var(--radius-md);
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition: opacity 0.2s ease, transform 0.2s ease;

  .time-label {
    font-size: 0.68rem;
    color: rgba(226, 232, 240, 0.75);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  }

  .footer-btns {
    display: flex;
    align-items: center;
    gap: 6px;

    .tool-btn {
      width: 24px;
      height: 24px;
      border-radius: var(--radius-sm);
      background: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.18s ease;

      &:hover {
        background: rgba(99, 102, 241, 0.25);
        border-color: rgba(99, 102, 241, 0.5);
        color: #fff;
      }

      &.delete-tool-btn:hover {
        background: rgba(239, 68, 68, 0.25);
        border-color: rgba(239, 68, 68, 0.5);
        color: #fca5a5;
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
