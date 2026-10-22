<script setup lang="ts">
import { computed } from "vue";
import type { ConnectionChatMessage } from "../../types";
import {
  formatDurationMs,
  formatFirstToken,
  formatSpeed,
  formatTokenCount,
  getMessageOutputSpeed,
  getMessageOutputTokens,
} from "../../utils/connectionMetrics";
import ModelRouteBadge from "./ModelRouteBadge.vue";

const props = defineProps<{
  message: ConnectionChatMessage;
}>();

const outputTokens = computed(() => getMessageOutputTokens(props.message));
const outputSpeed = computed(() => getMessageOutputSpeed(props.message));
const hasCacheUsage = computed(
  () =>
    props.message.usage?.cachedTokens !== undefined ||
    props.message.usage?.cacheWriteTokens !== undefined
);
</script>

<template>
  <div class="message-meta">
    <ModelRouteBadge
      :requested-model="message.requestedModel"
      :actual-model="message.responseModel"
    />

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
    <template v-if="hasCacheUsage">
      <span class="meta-item" title="从缓存读取的输入 token 数">
        缓存读 {{ formatTokenCount(message.usage?.cachedTokens ?? 0) }}
      </span>
      <span class="meta-item" title="写入缓存的输入 token 数">
        缓存写 {{ formatTokenCount(message.usage?.cacheWriteTokens ?? 0) }}
      </span>
    </template>
    <span
      v-if="outputSpeed !== null"
      class="meta-item"
      title="按首字之后的生成时长估算，过短时按总耗时计算"
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
    <span v-if="message.durationMs !== undefined" class="meta-item">
      {{ formatDurationMs(message.durationMs) }}
    </span>
    <span v-if="message.stopped" class="meta-item is-stopped">已停止</span>
  </div>
</template>

<style lang="scss" scoped>
.message-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 10px;
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

  &.is-stopped {
    color: #fbbf24;
  }
}
</style>
