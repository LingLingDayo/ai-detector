<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useConfirm } from "../../composables/useConfirm";
import { useConfigStore, useConnectionTestStore } from "../../stores";
import type { ConnectionImageAttachment } from "../../types";
import ConnectionChatHeader from "./ConnectionChatHeader.vue";
import ConnectionComposer from "./ConnectionComposer.vue";
import ConnectionMessageList from "./ConnectionMessageList.vue";

const configStore = useConfigStore();
const connectionStore = useConnectionTestStore();
const { confirm } = useConfirm();

const messageListRef = ref<InstanceType<typeof ConnectionMessageList> | null>(null);
const composerRef = ref<InstanceType<typeof ConnectionComposer> | null>(null);

const configReady = computed(() => {
  const config = configStore.connectionConfig;
  return Boolean(
    config.baseUrl?.trim() && config.apiKey?.trim() && config.modelName?.trim()
  );
});

const disabledHint = computed(() => {
  const config = configStore.connectionConfig;
  if (!config.baseUrl?.trim() || !config.apiKey?.trim()) {
    return "请先在上方填写 Base URL 与 API Key";
  }
  if (!config.modelName?.trim()) {
    return "请先在上方选择或输入测试模型";
  }
  return "";
});

const activeConfigName = computed(
  () =>
    configStore.matchedConfigItem?.name ||
    (configStore.isCurrentConfigSaved ? configStore.activeConfigName : undefined)
);

function handleSend(payload: {
  text: string;
  images: ConnectionImageAttachment[];
}): void {
  messageListRef.value?.scrollToBottom(true);
  void connectionStore.sendConnectionMessage(
    payload,
    configStore.connectionConfig,
    activeConfigName.value
  );
}

function handleRetry(messageId: string): void {
  messageListRef.value?.scrollToBottom(true);
  void connectionStore.retryConnectionReply(
    messageId,
    configStore.connectionConfig,
    activeConfigName.value
  );
}

async function handleClearContext(): Promise<void> {
  const confirmed = await confirm({
    type: "warning",
    styleVariant: "spotlight",
    title: "确认清空当前上下文？",
    message:
      "清空后当前会话的所有消息将被移除，下一次发送会开启新的历史记录。已保存的历史汇总统计不会删除。",
    confirmText: "清空上下文",
    cancelText: "取消",
  });
  if (!confirmed) return;
  connectionStore.clearConnectionContext();
}

function handleSuggestion(text: string): void {
  if (!configReady.value || connectionStore.isConnectionRunning) {
    composerRef.value?.fillText(text);
    return;
  }
  handleSend({ text, images: [] });
}

watch(
  () => connectionStore.isConnectionRunning,
  (running, wasRunning) => {
    if (wasRunning && !running) {
      messageListRef.value?.scrollToBottom();
    }
  }
);
</script>

<template>
  <section id="connection-section" class="card connection-card">
    <ConnectionChatHeader
      :stats="connectionStore.sessionStats"
      :is-running="connectionStore.isConnectionRunning"
      :is-generating="connectionStore.isConnectionGenerating"
      :latest-requested-model="connectionStore.latestRequestedModel"
      :latest-response-model="connectionStore.latestResponseModel"
      @clear="handleClearContext"
    />

    <ConnectionMessageList
      ref="messageListRef"
      :messages="connectionStore.messages"
      :is-running="connectionStore.isConnectionRunning"
      :is-generating="connectionStore.isConnectionGenerating"
      :active-elapsed-ms="connectionStore.activeElapsedMs"
      @suggest="handleSuggestion"
      @retry="handleRetry"
    />

    <ConnectionComposer
      ref="composerRef"
      :running="connectionStore.isConnectionRunning"
      :generating="connectionStore.isConnectionGenerating"
      :config-ready="configReady"
      :disabled-hint="disabledHint"
      :focus-signal="connectionStore.composerFocusSignal"
      @send="handleSend"
      @stop="connectionStore.stopConnectionReply"
    />
  </section>
</template>

<style lang="scss" scoped>
.connection-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 13px 14px 12px;
  animation: fadeIn 0.25s ease-out;
}

@media (max-width: 600px) {
  .connection-card {
    padding: 11px 10px 10px;
  }
}
</style>
