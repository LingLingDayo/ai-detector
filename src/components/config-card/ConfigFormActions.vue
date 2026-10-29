<script setup lang="ts">
import { computed } from "vue";
import { MessagesSquare, Zap } from "@lucide/vue";
import { SegmentedControl, type SegmentedOption } from "../common";
import type { ActiveTestMode, ConnectionTestMode } from "../../types";

const props = defineProps<{
  activeMode: ActiveTestMode;
  connectionMode: ConnectionTestMode;
  connectionRunning: boolean;
  showCancelState: boolean;
  hasResult: boolean;
  resetDisabled: boolean;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "update:connectionMode", mode: ConnectionTestMode): void;
  (e: "reset"): void;
}>();

const connectionModeOptions: SegmentedOption[] = [
  {
    value: "chat",
    label: "对话模式",
    icon: MessagesSquare,
    title: "完整多轮对话，展示回复、图片与统计",
  },
  {
    value: "quick",
    label: "精简模式",
    icon: Zap,
    title: "清空上下文并发送 Hi，仅通过顶部提示反馈结果",
  },
];

const startButtonLabel = computed(() => {
  if (props.activeMode === "connection") {
    if (props.connectionMode === "quick") {
      return props.showCancelState ? "取消测试" : "开始测试";
    }
    return props.hasResult ? "继续对话" : "开始对话";
  }
  return props.showCancelState
    ? "取消测试"
    : props.hasResult
    ? "重新生成"
    : "开始测试";
});

const startButtonTitle = computed(() => {
  if (props.activeMode === "connection") {
    if (props.showCancelState) {
      return "点击取消当前正在进行的测试";
    }
    if (props.connectionMode === "quick") {
      return "清空当前上下文并发送 Hi 进行快速测试";
    }
    return "滚动到下方对话框并聚焦输入框";
  }
  if (props.showCancelState) {
    return "点击取消当前正在进行的测试";
  }
  if (props.hasResult) {
    return props.activeMode === "probe"
      ? "重新执行 3 轮探测并计算模型归因"
      : "重新发起鹈鹕测试，让 AI 重新绘制 SVG";
  }
  return props.activeMode === "probe"
    ? "执行 3 轮探测，并在统一库中比对归因"
    : "发起鹈鹕测试，让 AI 绘制骑自行车 SVG";
});

function handleStartButtonClick(event: MouseEvent): void {
  if (!props.showCancelState) return;
  event.preventDefault();
  emit("cancel");
}

function handleConnectionModeChange(mode: string): void {
  emit("update:connectionMode", mode as ConnectionTestMode);
}
</script>

<template>
  <div class="form-actions">
    <button
      :type="showCancelState ? 'button' : 'submit'"
      class="btn btn-primary"
      :class="{ 'btn-cancel': showCancelState }"
      id="btn-start"
      :title="startButtonTitle"
      @click="handleStartButtonClick"
    >
      <span
        class="btn-spinner"
        :class="{ hidden: !showCancelState }"
        id="start-spinner"
      ></span>
      <span class="btn-text">{{ startButtonLabel }}</span>
    </button>

    <SegmentedControl
      v-if="activeMode === 'connection'"
      :model-value="connectionMode"
      :options="connectionModeOptions"
      :disabled="connectionRunning"
      size="sm"
      inline
      aria-label="连接测试模式"
      @change="handleConnectionModeChange"
    />

    <button
      type="button"
      class="btn btn-ghost"
      id="btn-reset"
      :disabled="resetDisabled"
      title="清空已保存的 Base URL 与 Key 等本地配置"
      @click="emit('reset')"
    >
      重置
    </button>
  </div>
</template>

<style lang="scss" scoped>
.form-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;

  .btn-cancel {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: #fff;
    box-shadow: 0 3px 12px rgba(239, 68, 68, 0.35);

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
      box-shadow: 0 5px 16px rgba(239, 68, 68, 0.5);
      transform: translateY(-1px);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }
  }
}
</style>
