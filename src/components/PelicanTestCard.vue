<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue";
import { useClipboard } from "../composables/useClipboard";
import { DEFAULT_PELICAN_PROMPT } from "../composables/usePelicanTest";

const props = withDefaults(
  defineProps<{
    isRunning: boolean;
    svg: string;
    rawText: string;
    durationMs: number;
    modelName: string;
    errorMessage: string | null;
    hasTested: boolean;
    prompt?: string;
  }>(),
  {
    prompt: DEFAULT_PELICAN_PROMPT,
  }
);

const emit = defineEmits<{
  (e: "retry"): void;
  (e: "update:prompt", value: string): void;
  (e: "reset-prompt"): void;
}>();

const { copied: promptCopied, copy: copyPrompt } = useClipboard();
const { copied: svgCopied, copy: copySvg } = useClipboard();

const showCode = ref(false);
const showRawText = ref(false);
const bgTheme = ref<"dark" | "checker">("dark");

const isEditingPrompt = ref(false);
const editingPrompt = ref("");
const promptTextareaRef = ref<HTMLTextAreaElement | null>(null);

const currentPrompt = computed(() => props.prompt || DEFAULT_PELICAN_PROMPT);
const isCustomPrompt = computed(() => currentPrompt.value !== DEFAULT_PELICAN_PROMPT);

function handleCopyPrompt(): void {
  copyPrompt(currentPrompt.value);
}

function startEditing(): void {
  if (props.isRunning) return;
  editingPrompt.value = currentPrompt.value;
  isEditingPrompt.value = true;
  nextTick(() => {
    promptTextareaRef.value?.focus();
    promptTextareaRef.value?.select();
  });
}

function cancelEditing(): void {
  isEditingPrompt.value = false;
}

function savePrompt(): void {
  const trimmed = editingPrompt.value.trim();
  const nextVal = trimmed || DEFAULT_PELICAN_PROMPT;
  emit("update:prompt", nextVal);
  isEditingPrompt.value = false;
}

function handleResetToDefault(): void {
  editingPrompt.value = DEFAULT_PELICAN_PROMPT;
}

watch(
  () => props.isRunning,
  (running) => {
    if (running && isEditingPrompt.value) {
      isEditingPrompt.value = false;
    }
  }
);

function handleCopySvg(): void {
  if (props.svg) {
    copySvg(props.svg);
  }
}

function handleDownloadSvg(): void {
  if (!props.svg) return;
  const blob = new Blob([props.svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const cleanModel = (props.modelName || "model").replace(/[^a-zA-Z0-9_-]/g, "_");
  a.href = url;
  a.download = `pelican-${cleanModel}-${Date.now()}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="card pelican-card" id="pelican-section">
    <!-- 卡片顶部标头 -->
    <div class="pelican-header">
      <div class="header-left">
        <div class="title-row">
          <div class="pelican-icon-box">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <!-- 自行车与飞鸟抽象几何图标 -->
              <circle cx="5.5" cy="17.5" r="3.5" />
              <circle cx="18.5" cy="17.5" r="3.5" />
              <path d="M15 6a3 3 0 1 0-3-3" />
              <path d="M12 17.5V14l-3-3 4-3 3 3h3" />
            </svg>
          </div>
          <h2>鹈鹕测试</h2>
          <span class="pelican-badge">模型降智直观测试</span>
        </div>
        <p class="subtitle">
          让 AI 绘制“鹈鹕骑自行车”SVG 图像。本测试不自动判定结果，请根据下方矢量图生成质量自行评估模型状态。
        </p>
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="btn-header-action"
          :disabled="isRunning"
          title="重新发起鹈鹕测试请求"
          @click="emit('retry')"
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
          <span>重新生成</span>
        </button>
      </div>
    </div>

    <!-- 提示词展示模块 -->
    <div class="prompt-box" :class="{ 'is-editing': isEditingPrompt }">
      <div class="prompt-header">
        <span class="prompt-label">
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span>测试提示词</span>
          <span v-if="isCustomPrompt" class="custom-badge" title="当前使用自定义提示词">自定义</span>
        </span>

        <div class="prompt-actions">
          <template v-if="isEditingPrompt">
            <button
              v-if="editingPrompt !== DEFAULT_PELICAN_PROMPT"
              type="button"
              class="btn-prompt-action reset"
              title="恢复为默认提示词"
              @click="handleResetToDefault"
            >
              <svg
                viewBox="0 0 24 24"
                width="11"
                height="11"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>恢复默认</span>
            </button>
            <button
              type="button"
              class="btn-prompt-action cancel"
              title="取消编辑 (Esc)"
              @click="cancelEditing"
            >
              <span>取消</span>
            </button>
            <button
              type="button"
              class="btn-prompt-action save"
              title="保存提示词 (Ctrl+Enter)"
              @click="savePrompt"
            >
              <svg
                viewBox="0 0 24 24"
                width="11"
                height="11"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>保存</span>
            </button>
          </template>

          <template v-else>
            <button
              type="button"
              class="btn-prompt-action edit"
              :disabled="isRunning"
              title="编辑测试提示词"
              @click="startEditing"
            >
              <svg
                viewBox="0 0 24 24"
                width="11"
                height="11"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span>编辑</span>
            </button>
            <button
              type="button"
              class="btn-prompt-action copy"
              title="复制测试提示词到剪贴板"
              @click="handleCopyPrompt"
            >
              <svg
                v-if="!promptCopied"
                viewBox="0 0 24 24"
                width="11"
                height="11"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                width="11"
                height="11"
                fill="none"
                stroke="#10b981"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{{ promptCopied ? "已复制" : "复制" }}</span>
            </button>
          </template>
        </div>
      </div>

      <div v-if="!isEditingPrompt" class="prompt-content">
        <code>{{ currentPrompt }}</code>
      </div>
      <div v-else class="prompt-edit-container">
        <textarea
          ref="promptTextareaRef"
          v-model="editingPrompt"
          class="prompt-textarea"
          rows="3"
          placeholder="输入自定义测试提示词..."
          @keydown.esc="cancelEditing"
          @keydown.ctrl.enter="savePrompt"
          @keydown.meta.enter="savePrompt"
        />
        <div class="prompt-edit-footer">
          <span class="prompt-edit-hint">按 <code>Ctrl+Enter</code> 快速保存，<code>Esc</code> 取消</span>
          <span class="prompt-char-count">{{ editingPrompt.length }} 字符</span>
        </div>
      </div>
    </div>

    <!-- 状态指示条（如果有测试信息或正在测试） -->
    <div v-if="hasTested || isRunning" class="status-summary-bar">
      <div class="status-left">
        <span v-if="isRunning" class="state-pill running">
          <span class="state-spinner"></span>
          正在生成 SVG 图形...
        </span>
        <span v-else-if="errorMessage" class="state-pill error">
          <span class="dot error"></span>
          请求异常
        </span>
        <span v-else-if="svg" class="state-pill success">
          <span class="dot success"></span>
          SVG 渲染就绪
        </span>
        <span v-else class="state-pill warning">
          <span class="dot warning"></span>
          未提取到有效 SVG
        </span>

        <span v-if="modelName" class="meta-item">
          模型: <strong>{{ modelName }}</strong>
        </span>
        <span v-if="durationMs > 0" class="meta-item">
          耗时: <strong>{{ (durationMs / 1000).toFixed(2) }}s</strong>
        </span>
      </div>

      <!-- 背景样式与视图切换 -->
      <div v-if="svg && !isRunning" class="view-controls">
        <div class="bg-switch-group">
          <button
            type="button"
            class="bg-btn"
            :class="{ active: bgTheme === 'dark' }"
            title="深色背景"
            @click="bgTheme = 'dark'"
          >
            深底
          </button>
          <button
            type="button"
            class="bg-btn"
            :class="{ active: bgTheme === 'checker' }"
            title="棋盘格背景 (便于查看浅色/透明线条)"
            @click="bgTheme = 'checker'"
          >
            网格
          </button>
        </div>

        <button
          type="button"
          class="ctrl-btn"
          title="复制 SVG 源码"
          @click="handleCopySvg"
        >
          <svg
            v-if="!svgCopied"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="#10b981"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{{ svgCopied ? "已复制" : "复制 SVG" }}</span>
        </button>

        <button
          type="button"
          class="ctrl-btn"
          title="下载 SVG 矢量文件"
          @click="handleDownloadSvg"
        >
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>下载 SVG</span>
        </button>

        <button
          type="button"
          class="ctrl-btn"
          :class="{ active: showCode }"
          title="查看或折叠 SVG 源码"
          @click="showCode = !showCode"
        >
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <span>源码</span>
        </button>
      </div>
    </div>

    <!-- 错误警告提示 -->
    <div v-if="errorMessage && !isRunning" class="alert-box error">
      <div class="alert-icon">!</div>
      <div class="alert-content">
        <span class="alert-title">测试失败：</span>
        <span class="alert-msg">{{ errorMessage }}</span>
      </div>
    </div>

    <!-- 主展示区（测试开始后展示） -->
    <div v-if="hasTested || isRunning" class="display-container">
      <!-- 加载中态 -->
      <div v-if="isRunning" class="loading-state">
        <div class="radar-spinner"></div>
        <div class="loading-text">
          <p class="loading-title">正在调用模型绘制鹈鹕骑自行车...</p>
          <p class="loading-desc">SVG 生成通常耗时 5 ~ 30 秒，请稍候</p>
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

    <!-- 可折叠的 SVG 源码展示区 -->
    <div v-if="showCode && svg && !isRunning" class="code-viewer-box">
      <div class="code-viewer-header">
        <span>SVG 源码 ({{ svg.length }} 字符)</span>
        <button type="button" class="btn-copy-code" @click="handleCopySvg">
          {{ svgCopied ? "已复制 ✓" : "复制代码" }}
        </button>
      </div>
      <pre class="code-pre"><code>{{ svg }}</code></pre>
    </div>

    <!-- 可折叠的完整模型原始文本展示区 -->
    <div v-if="svg && rawText && rawText !== svg && !isRunning" class="raw-toggle-wrap">
      <button
        type="button"
        class="btn-text-toggle"
        @click="showRawText = !showRawText"
      >
        <span>{{ showRawText ? "收起模型完整响应" : "查看模型完整响应内容" }}</span>
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          :class="{ rotated: showRawText }"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div v-if="showRawText" class="raw-response-dropdown">
        <pre class="raw-response-pre">{{ rawText }}</pre>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.pelican-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: fadeIn 0.25s ease-out;
}

.pelican-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 2px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;

    .pelican-icon-box {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: #818cf8;
    }

    h2 {
      font-size: 0.98rem;
      font-weight: 600;
      color: #fff;
    }

    .pelican-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 7px;
      font-size: 0.7rem;
      border-radius: 9999px;
      background: rgba(99, 102, 241, 0.12);
      border: 1px solid rgba(99, 102, 241, 0.25);
      color: #a5b4fc;
      line-height: 1.2;
    }
  }

  .subtitle {
    font-size: 0.76rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.btn-header-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 0.74rem;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition-fast);

  svg {
    display: block;
    flex-shrink: 0;
  }

  span {
    display: inline-flex;
    align-items: center;
    line-height: 1;
  }

  &:hover:not(:disabled) {
    background: rgba(30, 41, 59, 0.95);
    border-color: rgba(99, 102, 241, 0.4);
    color: var(--text-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* 提示词模块 */
.prompt-box {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(51, 65, 85, 0.5);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  transition: border-color var(--transition-fast), background-color var(--transition-fast);

  &.is-editing {
    border-color: rgba(99, 102, 241, 0.45);
    background: rgba(15, 23, 42, 0.75);
  }
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .prompt-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 600;
    color: #94a3b8;
    letter-spacing: 0.5px;

    .custom-badge {
      display: inline-flex;
      align-items: center;
      padding: 1px 5px;
      border-radius: 9999px;
      font-size: 0.65rem;
      font-weight: 500;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: #a5b4fc;
      margin-left: 2px;
    }
  }

  .prompt-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .btn-prompt-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 20px;
    padding: 0 6px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    font-size: 0.72rem;
    line-height: 1;
    cursor: pointer;
    border-radius: 3px;
    transition: all var(--transition-fast);
    font-family: inherit;

    svg {
      display: block;
      flex-shrink: 0;
    }

    span {
      display: inline-flex;
      align-items: center;
      line-height: 1;
      transform: translateY(1px);
    }

    &:hover:not(:disabled) {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.08);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &.edit {
      border: 1px solid var(--border-subtle);
      background: rgba(30, 41, 59, 0.4);

      &:hover:not(:disabled) {
        border-color: rgba(99, 102, 241, 0.4);
        background: rgba(99, 102, 241, 0.15);
        color: #e0e7ff;
      }
    }

    &.save {
      background: rgba(99, 102, 241, 0.25);
      border: 1px solid #6366f1;
      color: #c7d2fe;

      &:hover {
        background: rgba(99, 102, 241, 0.45);
        color: #ffffff;
      }
    }

    &.cancel {
      border: 1px solid var(--border-subtle);
      background: rgba(30, 41, 59, 0.4);

      &:hover {
        color: #cbd5e1;
        background: rgba(255, 255, 255, 0.08);
      }
    }

    &.reset {
      color: #94a3b8;

      &:hover {
        color: #f59e0b;
        background: rgba(245, 158, 11, 0.1);
      }
    }
  }
}

.prompt-content {
  code {
    display: block;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.78rem;
    color: #38bdf8;
    line-height: 1.45;
    word-break: break-all;
    user-select: text;
  }
}

.prompt-edit-container {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 2px;
}

.prompt-textarea {
  width: 100%;
  box-sizing: border-box;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: var(--radius-xs, 4px);
  padding: 6px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  color: #e2e8f0;
  line-height: 1.45;
  resize: vertical;
  min-height: 56px;
  max-height: 160px;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);

  &:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
  }
}

.prompt-edit-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.68rem;
  color: #64748b;
  padding: 0 2px;

  .prompt-edit-hint {
    code {
      font-size: 0.68rem;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.06);
      padding: 1px 4px;
      border-radius: 3px;
    }
  }

  .prompt-char-count {
    color: #64748b;
    font-feature-settings: "tnum";
  }
}

/* 状态概览栏 */
.status-summary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(17, 24, 39, 0.6);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.status-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 0.74rem;

  .state-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 7px;
    border-radius: 9999px;
    font-size: 0.72rem;
    font-weight: 500;

    &.running {
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: #60a5fa;
    }

    &.success {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
    }

    &.error {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }

    &.warning {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
    }

    .dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;

      &.success { background: #10b981; }
      &.error { background: #ef4444; }
      &.warning { background: #f59e0b; }
    }

    .state-spinner {
      width: 9px;
      height: 9px;
      border: 1.5px solid rgba(96, 165, 250, 0.3);
      border-top-color: #60a5fa;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  }

  .meta-item {
    color: var(--text-muted);

    strong {
      color: var(--text-primary);
      font-weight: 500;
    }
  }
}

.view-controls {
  display: flex;
  align-items: center;
  gap: 6px;

  .bg-switch-group {
    display: inline-flex;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
    background: rgba(15, 23, 42, 0.6);
    overflow: hidden;

    .bg-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.7rem;
      padding: 3px 6px;
      cursor: pointer;
      transition: all var(--transition-fast);

      &.active {
        background: rgba(99, 102, 241, 0.3);
        color: #fff;
      }
    }
  }

  .ctrl-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 7px;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.7rem;
    cursor: pointer;
    transition: all var(--transition-fast);

    &:hover {
      background: rgba(30, 41, 59, 0.9);
      color: #fff;
      border-color: rgba(99, 102, 241, 0.4);
    }

    &.active {
      background: rgba(99, 102, 241, 0.25);
      border-color: #6366f1;
      color: #fff;
    }
  }
}

/* 错误警告条 */
.alert-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.76rem;

  &.error {
    background: var(--danger-bg);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }

  .alert-icon {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ef4444;
    color: #fff;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.68rem;
    flex-shrink: 0;
  }

  .alert-title {
    font-weight: 600;
  }
}

/* 主展示容器 */
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

/* 加载状态 */
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

/* SVG 渲染舞台 */
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

/* 未识别到 SVG 时的回退文本区 */
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

/* 源码预览器 */
.code-viewer-box {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(51, 65, 85, 0.5);
  border-radius: var(--radius-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.code-viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: rgba(30, 41, 59, 0.5);
  border-bottom: 1px solid var(--border-subtle);
  font-size: 0.72rem;
  color: var(--text-secondary);

  .btn-copy-code {
    background: transparent;
    border: none;
    color: #818cf8;
    font-size: 0.72rem;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }
}

.code-pre {
  padding: 10px;
  max-height: 220px;
  overflow-y: auto;
  user-select: text;

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.72rem;
    color: #93c5fd;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-all;
  }
}

/* 完整响应折叠 */
.raw-toggle-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .btn-text-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 0.72rem;
    cursor: pointer;
    padding: 2px 4px;
    transition: color var(--transition-fast);

    &:hover {
      color: var(--text-secondary);
    }

    svg {
      transition: transform var(--transition-fast);

      &.rotated {
        transform: rotate(180deg);
      }
    }
  }
}

.raw-response-dropdown {
  animation: fadeIn 0.15s ease-out;
}
</style>
