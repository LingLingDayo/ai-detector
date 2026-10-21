<script setup lang="ts">
import { computed } from "vue";
import type { PelicanContentType } from "../../stores/pelicanTest";

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

const displayContent = computed(() => props.content || props.svg || "");
const bodyColor = computed(() => (props.bgTheme === "light" ? "#1e293b" : "#e2e8f0"));

const wrappedHtml = computed(() => {
  if (!displayContent.value) return "";
  const raw = displayContent.value.trim();

  // 如果已经包含完整 <html> 或 <!DOCTYPE html>
  if (/<!DOCTYPE\s+html|<html[\s>]/i.test(raw)) {
    const styleInjection = `
<style id="__pelican_injected_style">
  html {
    background-color: transparent !important;
  }
  body {
    background-color: transparent !important;
    margin: 0;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    color: ${bodyColor.value};
  }
  svg, canvas, img {
    max-width: 100%;
    max-height: 90vh;
    object-fit: contain;
  }
</style>
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
    html {
      background-color: transparent !important;
    }
    body {
      margin: 0;
      padding: 16px;
      min-height: 100vh;
      background-color: transparent !important;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: ${bodyColor.value};
      overflow: auto;
    }
    svg, canvas, img {
      max-width: 100%;
      max-height: 90vh;
      object-fit: contain;
    }
  </style>
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
        <p class="loading-desc">生成通常耗时 10 ~ 60 秒，请稍候</p>
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
        class="svg-render-viewport"
        v-html="displayContent"
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
  min-height: 420px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0d121c;
  transition: background 0.25s ease, border-color 0.25s ease;

  &.light-bg {
    background: #f8fafc;
    border-color: rgba(203, 213, 225, 0.4);
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
    border: 3px solid rgba(99, 102, 241, 0.2);
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.9s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite;
  }

  .loading-title {
    font-size: 0.84rem;
    font-weight: 600;
    color: #e2e8f0;
  }

  .loading-desc {
    font-size: 0.74rem;
    color: var(--text-muted);
    margin-top: 3px;
  }
}

.display-stage {
  width: 100%;
  height: 100%;
  min-height: 340px;
  max-height: 520px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
  background: radial-gradient(circle at center, #161f30 0%, #0d121c 100%);
  transition: background 0.25s ease;

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
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  :deep(svg) {
    max-width: 100%;
    max-height: 460px;
    width: auto;
    height: auto;
    display: block;
    margin: 0 auto;
    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.35));
    user-select: none;
    transition: filter 0.25s ease;
  }
}

.html-render-viewport {
  width: 100%;
  height: 460px;
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
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .fallback-tip {
    font-size: 0.74rem;
    color: #fbbf24;

    code {
      color: #fde68a;
    }
  }
}

.raw-response-pre {
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.74rem;
  color: #cbd5e1;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 240px;
  overflow-y: auto;
  user-select: text;
}
</style>
