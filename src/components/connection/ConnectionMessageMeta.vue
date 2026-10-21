<script setup lang="ts">
import { computed } from "vue";
import type { ConnectionChatMessage } from "../../types";
import {
  formatCacheRate,
  formatDurationMs,
  formatFirstToken,
  formatSpeed,
  formatTokenCount,
  getMessageCacheRate,
  getMessageOutputSpeed,
  getMessageOutputTokens,
} from "../../utils/connectionMetrics";
import ModelRouteBadge from "./ModelRouteBadge.vue";

const props = withDefaults(
  defineProps<{
    message: ConnectionChatMessage;
    liveElapsedMs?: number;
  }>(),
  {
    liveElapsedMs: 0,
  }
);

const outputTokens = computed(() => getMessageOutputTokens(props.message));
const outputSpeed = computed(() => getMessageOutputSpeed(props.message));
const cacheRate = computed(() => getMessageCacheRate(props.message));
const elapsedMs = computed(
  () => props.message.durationMs ?? props.liveElapsedMs
);
</script>

<template>
  <div class="message-meta">
    <ModelRouteBadge
      :requested-model="message.requestedModel"
      :actual-model="message.responseModel"
    />

    <template v-if="message.streaming">
      <span class="meta-item is-live">
        <span class="live-dot"></span>
        生成中 · {{ message.content.length }} 字符
      </span>
      <span v-if="elapsedMs > 0" class="meta-item">
        {{ formatDurationMs(elapsedMs) }}
      </span>
    </template>

    <template v-else>
      <span
        v-if="message.usage?.inputTokens !== undefined"
        class="meta-item"
        title="上游返回的输入 token 数"
      >
        输入 {{ formatTokenCount(message.usage.inputTokens) }}
      </span>
      <span
        v-if="outputTokens.count > 0"
        class="meta-item"
        :title="outputTokens.estimated ? '上游未返回输出 token，按字符数估算' : '上游返回的输出 token 数'"
      >
        {{ outputTokens.estimated ? "≈ " : "" }}输出 {{ formatTokenCount(outputTokens.count) }}
      </span>
      <span
        v-if="cacheRate !== null"
        class="meta-item"
        title="命中缓存的输入 token 占比"
      >
        缓存 {{ formatCacheRate(cacheRate) }}
      </span>
      <span
        v-if="message.usage?.cacheWriteTokens"
        class="meta-item"
        title="写入缓存的输入 token 数"
      >
        缓存写入 {{ formatTokenCount(message.usage.cacheWriteTokens) }}
      </span>
      <span
        v-if="outputSpeed !== null"
        class="meta-item"
        title="按首个输出 token 之后的生成时长计算"
      >
        {{ formatSpeed(outputSpeed) }}
      </span>
      <span
        v-if="message.firstTokenMs !== undefined"
        class="meta-item"
        title="从发起请求到收到首个文本 token"
      >
        首字 {{ formatFirstToken(message.firstTokenMs) }}
      </span>
      <span v-if="elapsedMs > 0" class="meta-item">
        {{ formatDurationMs(elapsedMs) }}
      </span>
      <span v-if="message.stopped" class="meta-item is-stopped">已停止</span>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.message-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 10px;
  margin-top: 7px;
  min-height: 18px;
  color: #64748b;
  font-size: 0.66rem;
  line-height: 1.4;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;

  &.is-live {
    color: #a5b4fc;
  }

  &.is-stopped {
    color: #fbbf24;
  }
}

.live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #818cf8;
  box-shadow: 0 0 7px rgba(129, 140, 248, 0.9);
  animation: meta-pulse 1.2s infinite ease-in-out;
}

@keyframes meta-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.25);
  }
}
</style>
