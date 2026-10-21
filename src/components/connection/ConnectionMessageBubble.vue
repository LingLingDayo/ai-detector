<script setup lang="ts">
import { computed } from "vue";
import { AlertCircle, Check, Copy, RefreshCw } from "@lucide/vue";
import logoUrl from "../../assets/logo.png";
import type { ConnectionChatMessage } from "../../types";
import { useClipboard } from "../../composables/useClipboard";
import { formatDurationMs } from "../../utils/connectionMetrics";
import { renderMarkdown } from "../../utils/markdown";
import { formatHistoryTime } from "../../utils/pelicanFormatters";
import ConnectionMessageMeta from "./ConnectionMessageMeta.vue";

const props = withDefaults(
  defineProps<{
    message: ConnectionChatMessage;
    liveElapsedMs?: number;
    canRetry?: boolean;
    retryHint?: string;
  }>(),
  {
    liveElapsedMs: 0,
    canRetry: false,
    retryHint: "重新生成回复",
  }
);

const emit = defineEmits<{
  (e: "retry", messageId: string): void;
}>();

const { copied, copy } = useClipboard();

const renderedContent = computed(() => {
  let html = renderMarkdown(props.message.content);
  if (!props.message.streaming || !html) return html;
  const caret = '<span class="stream-caret"></span>';
  if (html.endsWith("</p>")) {
    return `${html.slice(0, -4)}${caret}</p>`;
  }
  return `${html}${caret}`;
});

const imageGridClass = computed(() => {
  const count = props.message.images.length;
  if (count <= 1) return "count-1";
  if (count === 2) return "count-2";
  return "count-many";
});

const messageTime = computed(() => formatHistoryTime(props.message.createdAt));
const messageDateTime = computed(() =>
  new Date(props.message.createdAt).toISOString()
);

function handleCopy(): void {
  if (props.message.content) {
    copy(props.message.content);
  }
}
</script>

<template>
  <div class="message-row" :class="`is-${message.role}`">
    <div v-if="message.role === 'assistant'" class="assistant-avatar">
      <img :src="logoUrl" alt="" />
    </div>

    <div class="message-stack">
      <div v-if="message.role === 'user'" class="user-bubble">
        <p v-if="message.content" class="user-text">{{ message.content }}</p>
        <div
          v-if="message.images.length"
          class="image-grid"
          :class="imageGridClass"
        >
          <img
            v-for="image in message.images"
            :key="image.id"
            :src="image.previewUrl"
            :alt="image.name"
            :title="image.name"
          />
        </div>
      </div>

      <div v-else class="assistant-body">
        <div
          v-if="message.content"
          class="markdown-body"
          v-html="renderedContent"
        ></div>

        <div
          v-if="message.streaming"
          class="stream-state"
          :class="{ 'has-content': Boolean(message.content) }"
        >
          <span v-if="!message.content" class="typing-dots">
            <span></span><span></span><span></span>
          </span>
          <span v-else class="stream-live-dot"></span>
          <span>{{ message.content ? "生成中" : "正在等待模型响应" }}</span>
          <span v-if="message.content" class="stream-char-count">
            {{ message.content.length }} 字符
          </span>
          <span v-if="liveElapsedMs > 0" class="waiting-time">
            {{ formatDurationMs(liveElapsedMs) }}
          </span>
        </div>

        <div v-if="message.error" class="error-note">
          <AlertCircle :size="14" />
          <span>{{ message.error }}</span>
        </div>

        <div v-if="!message.streaming" class="assistant-footer">
          <ConnectionMessageMeta :message="message" />
          <div class="footer-trailing">
            <time class="message-time" :datetime="messageDateTime">
              {{ messageTime }}
            </time>
            <div class="message-actions">
              <button
                v-if="message.content"
                type="button"
                class="copy-message-btn"
                :title="copied ? '已复制' : '复制回复内容'"
                @click="handleCopy"
              >
                <Check v-if="copied" :size="12" />
                <Copy v-else :size="12" />
              </button>
              <button
                v-if="canRetry"
                type="button"
                class="retry-message-btn"
                :title="retryHint"
                :aria-label="retryHint"
                @click="emit('retry', message.id)"
              >
                <RefreshCw :size="12" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.message-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  animation: message-in 0.22s ease-out;

  &.is-user {
    justify-content: flex-end;
    padding-left: 48px;
  }

  &.is-assistant {
    padding-right: 16px;
  }
}

.assistant-avatar {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.24);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.12);
  user-select: none;

  img {
    width: 20px;
    height: 20px;
    object-fit: contain;
    filter: drop-shadow(0 0 5px rgba(99, 102, 241, 0.35));
  }
}

.message-stack {
  flex: 1;
  min-width: 0;
  max-width: 100%;
}

.is-user .message-stack {
  display: flex;
  justify-content: flex-end;
}

.user-bubble {
  max-width: 78%;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 9px 13px;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.28), rgba(37, 99, 235, 0.2));
  border: 1px solid rgba(129, 140, 248, 0.25);
  border-radius: 13px 13px 4px 13px;
  box-shadow: 0 4px 16px rgba(30, 41, 59, 0.2);

  .user-text {
    color: #f1f5f9;
    font-size: 0.8rem;
    line-height: 1.62;
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
  }
}

.image-grid {
  display: grid;
  gap: 5px;
  max-width: 360px;

  &.count-1 {
    grid-template-columns: minmax(0, 1fr);
  }

  &.count-2,
  &.count-many {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  img {
    width: 100%;
    max-height: 180px;
    object-fit: cover;
    border-radius: 7px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    display: block;
    cursor: zoom-in;
  }

  &.count-1 img {
    max-width: 300px;
  }
}

.assistant-body {
  min-width: 0;
  width: 100%;
  padding-top: 1px;
}

.assistant-body:has(> .assistant-footer:first-child) {
  padding-top: 0;
}

.markdown-body {
  color: #dbe3ee;
  font-size: 0.8rem;
  line-height: 1.68;
  word-break: break-word;
  user-select: text;

  :deep(p) {
    margin: 0 0 7px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    color: #f8fafc;
    line-height: 1.35;
    margin: 12px 0 6px;
    font-weight: 650;

    &:first-child {
      margin-top: 0;
    }
  }

  :deep(h1) {
    font-size: 1.08rem;
  }

  :deep(h2) {
    font-size: 1rem;
  }

  :deep(h3) {
    font-size: 0.92rem;
  }

  :deep(h4),
  :deep(h5),
  :deep(h6) {
    font-size: 0.84rem;
  }

  :deep(ul),
  :deep(ol) {
    margin: 5px 0 8px;
    padding-left: 20px;
  }

  :deep(li) {
    margin: 2px 0;
  }

  :deep(blockquote) {
    margin: 8px 0;
    padding: 6px 11px;
    border-left: 2px solid rgba(99, 102, 241, 0.55);
    background: rgba(99, 102, 241, 0.07);
    border-radius: 0 5px 5px 0;
    color: #aebbd0;
  }

  :deep(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.73rem;
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 4px;
    padding: 1px 5px;
    color: #c7d2fe;
  }

  :deep(pre) {
    margin: 8px 0;
    padding: 10px 12px;
    background: #080d17;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 7px;
    overflow-x: auto;

    code {
      display: block;
      padding: 0;
      border: none;
      background: transparent;
      color: #cbd5e1;
      font-size: 0.72rem;
      line-height: 1.6;
      white-space: pre;
    }
  }

  :deep(a) {
    color: #93c5fd;
    text-decoration: underline;
    text-underline-offset: 2px;

    &:hover {
      color: #bfdbfe;
    }
  }

  :deep(hr) {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    margin: 12px 0;
  }

  :deep(strong) {
    color: #f1f5f9;
    font-weight: 650;
  }

  :deep(del) {
    color: #64748b;
  }

  :deep(.stream-caret) {
    display: inline-block;
    width: 6px;
    height: 0.95em;
    margin-left: 2px;
    vertical-align: -1px;
    border-radius: 1px;
    background: #818cf8;
    box-shadow: 0 0 7px rgba(129, 140, 248, 0.8);
    animation: caret-blink 0.9s step-end infinite;
  }
}

.stream-state {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 0 2px;
  color: #94a3b8;
  font-size: 0.72rem;

  &.has-content {
    margin-top: 3px;
  }

  .stream-char-count,
  .waiting-time {
    color: #64748b;
    font-size: 0.66rem;
  }
}

.stream-live-dot {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #818cf8;
  box-shadow: 0 0 7px rgba(129, 140, 248, 0.9);
  animation: stream-pulse 1.2s infinite ease-in-out;
}

.typing-dots {
  display: inline-flex;
  align-items: center;
  gap: 3px;

  span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #818cf8;
    animation: typing-bounce 1.15s infinite ease-in-out;

    &:nth-child(2) {
      animation-delay: 0.14s;
    }

    &:nth-child(3) {
      animation-delay: 0.28s;
    }
  }
}

.error-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 7px;
  padding: 7px 9px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.22);
  border-radius: 6px;
  color: #fca5a5;
  font-size: 0.72rem;
  line-height: 1.5;
  user-select: text;

  svg {
    flex-shrink: 0;
    margin-top: 1px;
  }
}

.assistant-footer {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
  user-select: none;

  &:first-child {
    margin-top: 0;
    min-height: 26px;
    align-items: center;
  }

  :deep(.message-meta) {
    flex: 1;
  }
}

.footer-trailing {
  flex-shrink: 0;
  display: grid;
  justify-items: end;
  align-items: start;

  > * {
    grid-area: 1 / 1;
  }
}

.message-time {
  color: #64748b;
  font-size: 0.66rem;
  line-height: 22px;
  white-space: nowrap;
  opacity: 1;
  visibility: visible;
  transition: opacity var(--transition-fast), visibility var(--transition-fast);
}

.message-actions {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--transition-fast), visibility var(--transition-fast);
}

.copy-message-btn,
.retry-message-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #64748b;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    color: #cbd5e1;
    background: rgba(255, 255, 255, 0.06);
  }
}

.assistant-body:hover .message-time,
.footer-trailing:focus-within .message-time {
  opacity: 0;
  visibility: hidden;
}

.assistant-body:hover .message-actions,
.footer-trailing:focus-within .message-actions {
  opacity: 1;
  visibility: visible;
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes caret-blink {
  0%,
  55% {
    opacity: 1;
  }
  56%,
  100% {
    opacity: 0;
  }
}

@keyframes typing-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  40% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

@keyframes stream-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1.18);
  }
}

@media (max-width: 600px) {
  .message-row {
    &.is-user {
      padding-left: 16px;
    }

    &.is-assistant {
      padding-right: 0;
    }
  }

  .user-bubble {
    max-width: 92%;
  }
}
</style>
