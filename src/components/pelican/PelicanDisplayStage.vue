<script setup lang="ts">
defineProps<{
  isRunning: boolean;
  svg: string;
  rawText: string;
  bgTheme: "dark" | "checker";
}>();
</script>

<template>
  <div class="display-container">
    <!-- 加载中态 -->
    <div v-if="isRunning" class="loading-state">
      <div class="radar-spinner"></div>
      <div class="loading-text">
        <p class="loading-title">正在调用模型绘制鹈鹕骑自行车...</p>
        <p class="loading-desc">SVG 生成通常耗时 10 ~ 60 秒，请稍候</p>
      </div>
    </div>

    <!-- 渲染成功态 -->
    <div
      v-else-if="svg"
      class="svg-stage"
      :class="bgTheme"
    >
      <div
        class="svg-render-viewport"
        v-html="svg"
      ></div>
    </div>

    <!-- 未提取出 SVG 且有原始返回文本态 -->
    <div v-else-if="rawText" class="fallback-text-box">
      <div class="fallback-tip">
        未能解析出标准 <code>&lt;svg&gt;</code> 标签，以下为模型返回的原始内容：
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

.svg-stage {
  width: 100%;
  height: 100%;
  min-height: 340px;
  max-height: 520px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
  transition: background 0.2s ease;

  &.dark {
    background: radial-gradient(circle at center, #161f30 0%, #0d121c 100%);
  }

  &.checker {
    background-color: #1a2233;
    background-image:
      linear-gradient(45deg, #121824 25%, transparent 25%),
      linear-gradient(-45deg, #121824 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #121824 75%),
      linear-gradient(-45deg, transparent 75%, #121824 75%);
    background-size: 16px 16px;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0;
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
  }
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
