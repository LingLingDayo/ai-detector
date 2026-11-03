<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { ImagePlus, Sparkles, Wand2, Zap } from "@lucide/vue";
import logoUrl from "../../assets/logo.png";
import type { ConnectionChatMessage } from "../../types";
import ConnectionMessageBubble from "./ConnectionMessageBubble.vue";

const props = withDefaults(
  defineProps<{
    messages: ConnectionChatMessage[];
    isRunning?: boolean;
    isGenerating?: boolean;
    activeElapsedMs?: number;
  }>(),
  {
    isRunning: false,
    isGenerating: false,
    activeElapsedMs: 0,
  }
);

const emit = defineEmits<{
  (e: "suggest", text: string): void;
  (e: "retry", messageId: string): void;
}>();

const scrollRef = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);

const suggestions = [
  {
    icon: Zap,
    text: "Hi",
  },
  {
    icon: Wand2,
    text: "9.11 和 9.9 哪个大？为什么？",
  },
  {
    icon: Sparkles,
    text: "用三句话介绍你自己",
  },
  {
    icon: ImagePlus,
    text: "写一段 TypeScript 快速排序，并解释思路",
  },
];

const lastMessage = computed(() => props.messages[props.messages.length - 1]);
const lastContentLength = computed(() => lastMessage.value?.content.length ?? 0);

function canRetryMessage(message: ConnectionChatMessage): boolean {
  return !props.isRunning && !message.streaming && message.role === "assistant";
}

function getRetryHint(index: number): string {
  return index < props.messages.length - 1
    ? "重新生成此回复，后续对话将被移除"
    : "重新生成回复";
}

function scrollToBottom(force = false): void {
  if (!force && !stickToBottom.value) return;
  nextTick(() => {
    const element = scrollRef.value;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    stickToBottom.value = true;
  });
}

function handleScroll(): void {
  const element = scrollRef.value;
  if (!element) return;
  stickToBottom.value =
    element.scrollHeight - element.scrollTop - element.clientHeight < 72;
}

watch(
  [() => props.messages.length, lastContentLength, () => props.isGenerating],
  () => {
    if (stickToBottom.value) {
      scrollToBottom();
    }
  },
  { flush: "post" }
);

onMounted(() => {
  scrollToBottom(true);
});

defineExpose({ scrollToBottom });
</script>

<template>
  <div ref="scrollRef" class="chat-scroll" @scroll.passive="handleScroll">
    <div v-if="messages.length === 0" class="chat-empty">
      <div class="empty-orb">
        <img :src="logoUrl" alt="" />
      </div>
      <h3>开始一次连接测试</h3>
      <div class="suggestion-list">
        <button
          v-for="suggestion in suggestions"
          :key="suggestion.text"
          type="button"
          class="suggestion-chip"
          @click="emit('suggest', suggestion.text)"
        >
          <component :is="suggestion.icon" :size="13" />
          <span>{{ suggestion.text }}</span>
        </button>
      </div>
    </div>

    <div v-else class="message-list">
      <ConnectionMessageBubble
        v-for="(message, index) in messages"
        :key="message.id"
        :message="message"
        :live-elapsed-ms="
          message.streaming && index === messages.length - 1
            ? activeElapsedMs
            : 0
        "
        :can-retry="canRetryMessage(message)"
        :retry-hint="getRetryHint(index)"
        :is-generating="
          message.streaming && index === messages.length - 1 && isGenerating
        "
        @retry="emit('retry', $event)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chat-scroll {
  position: relative;
  height: clamp(320px, 46vh, 500px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 15px 20px;
  background: var(--bg-chat-stage);
  border: 1px solid var(--border-chat-stage);
  border-radius: 10px;
  box-shadow: var(--shadow-chat-stage);
  user-select: text;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 14px;

  :deep(.message-row.is-assistant + .message-row.is-user) {
    margin-top: 4px;
    padding-top: 16px;
    border-top: 1px solid var(--overlay-soft);
  }
}

.chat-empty {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 18px 16px;
  user-select: none;

  .empty-orb {
    width: 54px;
    height: 54px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.16), rgba(6, 182, 212, 0.1));
    border: 1px solid rgba(99, 102, 241, 0.28);
    box-shadow: 0 0 28px rgba(99, 102, 241, 0.16);
    margin-bottom: 13px;

    img {
      width: 34px;
      height: 34px;
      object-fit: contain;
      filter: drop-shadow(0 0 9px rgba(99, 102, 241, 0.4));
    }
  }

  h3 {
    font-size: 15px;
    font-weight: 650;
    color: var(--text-strong);
    margin-bottom: 2px;
  }

  .suggestion-list {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 7px;
    margin-top: 17px;
    max-width: 560px;
  }

  .suggestion-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 11px;
    background: var(--bg-surface-control);
    border: 1px solid var(--border-subtle);
    border-radius: 9999px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1;
    font-family: inherit;
    cursor: pointer;
    transition: all var(--transition-fast);

    svg {
      color: var(--accent-icon);
      flex-shrink: 0;
    }

    &:hover {
      color: var(--accent-text);
      background: rgba(99, 102, 241, 0.12);
      border-color: rgba(99, 102, 241, 0.35);
      transform: translateY(-1px);
    }
  }
}

@media (max-width: 600px) {
  .chat-scroll {
    height: clamp(300px, 42vh, 430px);
    padding: 13px 11px 16px;
  }

  .chat-empty .suggestion-list {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    max-width: 360px;
  }

  .chat-empty .suggestion-chip {
    justify-content: flex-start;
  }
}
</style>
