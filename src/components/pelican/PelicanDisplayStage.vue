<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { PelicanContentType } from "../../stores/pelicanTest";
import { normalizeSvgForDisplay } from "./pelicanSvgNormalizer";
import { FIT_VIEWPORT_SCRIPT } from "./pelicanPreview";

const props = withDefaults(
  defineProps<{
    isRunning: boolean;
    content?: string;
    svg?: string;
    contentType?: PelicanContentType;
    rawText: string;
    bgTheme?: "dark" | "light";
  }>(),
  {
    content: "",
    svg: "",
    contentType: "svg",
    bgTheme: "dark",
  }
);

const svgViewportRef = ref<HTMLElement | null>(null);
const displayContent = computed(() => props.content || props.svg || "");
const bodyColor = computed(() => (props.bgTheme === "light" ? "#1e293b" : "#e2e8f0"));

const processedSvgContent = computed(() => {
  if (!displayContent.value || props.contentType !== "svg") {
    return displayContent.value;
  }
  return normalizeSvgForDisplay(displayContent.value);
});

/**
 * 若挂载后的 SVG 缺少 viewBox（模型既未给 viewBox 也未给 width/height），
 * 通过 getBBox() 动态计算图形真实边界框并注入 viewBox，确保任意尺寸图形完整显示。
 */
function ensureMountedSvgFit(): void {
  const container = svgViewportRef.value;
  if (!container) return;
  const svgEl = container.querySelector<SVGSVGElement>("svg");
  if (!svgEl) return;

  if (!svgEl.getAttribute("viewBox")) {
    const wAttr = parseFloat(svgEl.getAttribute("width") || "");
    const hAttr = parseFloat(svgEl.getAttribute("height") || "");
    if (wAttr > 0 && hAttr > 0) {
      svgEl.setAttribute("viewBox", `0 0 ${wAttr} ${hAttr}`);
    } else if (typeof svgEl.getBBox === "function") {
      try {
        const bbox = svgEl.getBBox();
        if (bbox && bbox.width > 0 && bbox.height > 0) {
          const pad = Math.max(bbox.width, bbox.height) * 0.04;
          svgEl.setAttribute(
            "viewBox",
            `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`
          );
        }
      } catch {
        // 忽略隐藏或异常状态下的 getBBox 调用错误
      }
    }
  }

  const par = svgEl.getAttribute("preserveAspectRatio");
  if (!par || par === "none" || /slice/i.test(par)) {
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }
}

watch(
  [processedSvgContent, () => props.isRunning, () => props.contentType],
  () => {
    if (!props.isRunning && props.contentType === "svg" && processedSvgContent.value) {
      nextTick(() => {
        ensureMountedSvgFit();
      });
    }
  },
  { immediate: true }
);

onMounted(() => {
  nextTick(() => {
    ensureMountedSvgFit();
  });
});

const wrappedHtml = computed(() => {
  if (!displayContent.value) return "";
  const raw = displayContent.value.trim();

  // 如果已经包含完整 <html> 或 <!DOCTYPE html>
  if (/<!DOCTYPE\s+html|<html[\s>]/i.test(raw)) {
    const styleInjection = `
<style id="__pelican_injected_style">
  *, *::before, *::after {
    box-sizing: border-box;
  }
  :root {
    color-scheme: ${props.bgTheme};
  }
  html, body {
    background-color: transparent !important;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  body {
    display: flex;
    justify-content: center;
    align-items: center;
    color: ${bodyColor.value};
  }
  body > svg, body > canvas, body > img {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
</style>
${FIT_VIEWPORT_SCRIPT}
`;
    if (/<head[\s>]/i.test(raw)) {
      return raw.replace(/<head[\s>]/i, (m) => `${m}${styleInjection}`);
    }
    return `${styleInjection}${raw}`;
  }

  // 如果是 HTML 代码片段，包裹为标准 HTML 文档
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
    }
    :root {
      color-scheme: ${props.bgTheme};
    }
    html, body {
      background-color: transparent !important;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    body {
      padding: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: ${bodyColor.value};
    }
    body > svg, body > canvas, body > img {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  </style>
  ${FIT_VIEWPORT_SCRIPT}
</head>
<body>
  ${raw}
</body>
</html>`;
});
</script>

<template>
  <div class="display-container" :class="{ 'light-bg': bgTheme === 'light' }">
    <!-- 加载中态 -->
    <div v-if="isRunning" class="loading-state">
      <div class="radar-spinner"></div>
      <div class="loading-text">
        <p class="loading-title">正在调用模型生成...</p>
        <p class="loading-desc">生成通常耗时 20 ~ 90 秒，请稍候</p>
      </div>
    </div>

    <!-- 渲染成功态 -->
    <div
      v-else-if="displayContent"
      class="display-stage svg-stage"
      :class="{ 'light-bg': bgTheme === 'light' }"
    >
      <!-- SVG 渲染 -->
      <div
        v-if="contentType === 'svg'"
        ref="svgViewportRef"
        class="svg-render-viewport"
        v-html="processedSvgContent"
      ></div>

      <!-- HTML 渲染 -->
      <div
        v-else-if="contentType === 'html'"
        class="html-render-viewport"
      >
        <iframe
          class="html-render-frame"
          :srcdoc="wrappedHtml"
          sandbox="allow-scripts allow-same-origin"
          title="Pelican HTML Render Viewport"
          frameborder="0"
          scrolling="auto"
        ></iframe>
      </div>
    </div>

    <!-- 未提取出 SVG/HTML 且有原始返回文本态 -->
    <div v-else-if="rawText" class="fallback-text-box">
      <div class="fallback-tip">
        未能解析出标准 <code>&lt;svg&gt;</code> 或 <code>HTML</code> 结构，以下为模型返回的原始内容：
      </div>
      <pre class="raw-response-pre">{{ rawText }}</pre>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.display-container {
  height: 440px;
  box-sizing: border-box;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pelican-canvas-bg);
  transition: background 0.25s ease, border-color 0.25s ease;

  &.light-bg {
    background: #f8fafc;
    border-color: var(--border-subtle);

    .loading-state {
      .loading-title {
        color: #1e293b;
      }

      .loading-desc {
        color: #64748b;
      }
    }

    .fallback-text-box .fallback-tip {
      color: #b45309;

      code {
        color: #92400e;
      }
    }
  }
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 40px 20px;
  text-align: center;

  .radar-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid rgba(var(--accent-rgb), 0.2);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.9s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite;
  }

  .loading-title {
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .loading-desc {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 3px;
  }
}

.display-stage {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  position: relative;
  background: var(--pelican-canvas-radial);
  transition: background 0.25s ease;
  overflow: hidden;

  &.light-bg {
    background: radial-gradient(circle at center, #ffffff 0%, #f1f5f9 100%);

    :deep(svg) {
      filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.12));
    }

    .html-render-frame {
      filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.12));
    }
  }
}

.svg-render-viewport {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  :deep(svg) {
    width: 100% !important;
    height: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: 100% !important;
    max-height: 100% !important;
    object-fit: contain;
    display: block;
    margin: 0 auto;
    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.35));
    user-select: none;
    transition: filter 0.25s ease;
  }

  :deep(img) {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
    margin: 0 auto;
    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.35));
    user-select: none;
    transition: filter 0.25s ease;
  }
}

.html-render-viewport {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-sm);
}

.html-render-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  display: block;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.35));
  transition: filter 0.25s ease;
}

.fallback-text-box {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;

  .fallback-tip {
    font-size: 12px;
    color: #fbbf24;

    code {
      color: #fde68a;
    }
  }
}

.raw-response-pre {
  background: var(--bg-elevated-strong);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: var(--text-soft);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
  flex: 1;
  max-height: 100%;
  overflow-y: auto;
  user-select: text;
}
</style>
