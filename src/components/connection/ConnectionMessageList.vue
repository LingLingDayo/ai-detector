<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { ImagePlus, Sparkles, Wand2 } from "@lucide/vue";
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
    icon: Sparkles,
    text: "用三句话介绍你自己",
  },
  {
    icon: Wand2,
    text: "9.11 和 9.9 哪个大？为什么？",
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
      <p>
        自由对话并实时核对上游真实模型。可发送图片，每次请求都会携带当前上下文的全部消息。
      </p>
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
        @retry="emit('retry', $event)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chat-scroll {
  height: clamp(320px, 46vh, 500px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 15px 20px;
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 9px;
  background:
    radial-gradient(circle at 92% 0%, rgba(99, 102, 241, 0.07), transparent 36%),
    rgba(7, 11, 19, 0.52);
  box-shadow: inset 0 1px 14px rgba(0, 0, 0, 0.18);
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 19px;
}

.chat-empty {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 18px 16px;

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
    font-size: 0.94rem;
    font-weight: 650;
    color: #f1f5f9;
    margin-bottom: 6px;
  }

  > p {
    max-width: 430px;
    color: #7b8ba3;
    font-size: 0.74rem;
    line-height: 1.65;
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
    padding: 6px 10px;
    background: rgba(30, 41, 59, 0.48);
    border: 1px solid rgba(255, 255, 255, 0.075);
    border-radius: 9999px;
    color: #94a3b8;
    font-size: 0.7rem;
    font-family: inherit;
    cursor: pointer;
    transition: all var(--transition-fast);

    svg {
      color: #818cf8;
      flex-shrink: 0;
    }

    &:hover {
      color: #e2e8f0;
      background: rgba(99, 102, 241, 0.14);
      border-color: rgba(99, 102, 241, 0.32);
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
