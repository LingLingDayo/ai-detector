<script setup lang="ts">
import { computed } from "vue";
import {
  Activity,
  CheckCircle2,
  Database,
  Gauge,
  MessagesSquare,
  RotateCcw,
  ShieldCheck,
} from "@lucide/vue";
import type { ConnectionSessionStats } from "../../types";
import {
  formatCacheRate,
  formatSpeed,
  formatSuccessRate,
  formatTokenCount,
} from "../../utils/connectionMetrics";

const props = withDefaults(
  defineProps<{
    stats: ConnectionSessionStats;
    isRunning?: boolean;
    isGenerating?: boolean;
    streamedCharCount?: number;
    latestRequestedModel?: string;
    latestResponseModel?: string;
  }>(),
  {
    isRunning: false,
    isGenerating: false,
    streamedCharCount: 0,
    latestRequestedModel: "",
    latestResponseModel: "",
  }
);

const emit = defineEmits<{
  (e: "clear"): void;
}>();

const liveStatusLabel = computed(() => {
  if (!props.isGenerating) return "等待响应...";
  return props.streamedCharCount > 0 ? "正在生成..." : "正在思考...";
});

const routeStatus = computed(() => {
  if (props.stats.responseModelStats.length === 0) {
    return { label: "等待响应", tone: "waiting" };
  }
  if (props.stats.mismatchCount > 0) {
    return { label: `${props.stats.mismatchCount} 次差异`, tone: "warning" };
  }
  return { label: "全部一致", tone: "success" };
});

const routeTitle = computed(() => {
  const requested = props.latestRequestedModel || "—";
  const actual = props.latestResponseModel || "上游未返回";
  return `最近一次请求模型：${requested}\n最近一次响应模型：${actual}`;
});

const successStatus = computed(() => {
  const finished =
    props.stats.successCount + props.stats.errorCount + props.stats.stoppedCount;
  const rate = props.stats.successRate;
  if (finished === 0 || rate === null) {
    return { label: "—", tone: "waiting" };
  }
  if (rate >= 1) return { label: formatSuccessRate(rate), tone: "success" };
  if (rate >= 0.8) return { label: formatSuccessRate(rate), tone: "warning" };
  return { label: formatSuccessRate(rate), tone: "danger" };
});

const successTitle = computed(
  () =>
    `成功 ${props.stats.successCount} · 失败 ${props.stats.errorCount} · 停止 ${props.stats.stoppedCount}`
);
</script>

<template>
  <header class="connection-header">
    <div class="header-main">
      <div class="header-icon">
        <MessagesSquare :size="18" />
      </div>
      <div class="header-copy">
        <div class="title-row">
          <h2>连接测试</h2>
          <span v-if="isRunning" class="live-badge">
            <span class="live-dot"></span>
            {{ liveStatusLabel }}
          </span>
        </div>
        <p>通过多轮对话测试接口，实时查看上游真实模型与 Token 用量</p>
      </div>
    </div>

    <button
      v-if="stats.requestCount > 0"
      type="button"
      class="clear-context-btn"
      title="重置当前对话（已保存的历史汇总不会删除）"
      @click="emit('clear')"
    >
      <RotateCcw :size="13" />
      <span>重置对话</span>
    </button>
  </header>

  <div v-if="stats.requestCount > 0" class="stats-strip">
    <div class="stat-item" title="本次会话已发起的请求次数">
      <span class="stat-icon"><Activity :size="12" /></span>
      <span class="stat-label">请求轮次</span>
      <strong>{{ stats.requestCount }}</strong>
    </div>

    <div
      class="stat-item"
      :class="`is-${successStatus.tone}`"
      :title="successTitle"
    >
      <span class="stat-icon"><CheckCircle2 :size="12" /></span>
      <span class="stat-label">成功率</span>
      <strong>{{ successStatus.label }}</strong>
    </div>

    <div
      class="stat-item"
      title="按首个输出 token 之后的生成时长计算"
    >
      <span class="stat-icon"><Gauge :size="12" /></span>
      <span class="stat-label">输出速度</span>
      <strong>{{ formatSpeed(stats.outputSpeed) }}</strong>
    </div>

    <div
      class="stat-item"
      :title="`缓存命中 ${formatTokenCount(stats.cachedTokens)} / 输入 ${formatTokenCount(stats.inputTokens)}`"
    >
      <span class="stat-icon"><Database :size="12" /></span>
      <span class="stat-label">缓存命中</span>
      <strong>{{ formatCacheRate(stats.cacheRate) }}</strong>
    </div>

    <div
      class="stat-item"
      :class="`is-${routeStatus.tone}`"
      :title="routeTitle"
    >
      <span class="stat-icon"><ShieldCheck :size="12" /></span>
      <span class="stat-label">模型核对</span>
      <strong>{{ routeStatus.label }}</strong>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.connection-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.header-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.header-icon {
  width: 31px;
  height: 31px;
  flex-shrink: 0;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.28);
  color: var(--accent-text);
  box-shadow: 0 0 16px rgba(99, 102, 241, 0.12);
}

.header-copy {
  min-width: 0;

  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h2 {
    font-size: 15px;
    font-weight: 650;
    color: var(--text-strong);
    line-height: 1.3;
  }

  p {
    margin-top: 2px;
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.4;
  }
}

.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 18px;
  padding: 0 7px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  background: rgba(99, 102, 241, 0.13);
  border: 1px solid rgba(99, 102, 241, 0.32);
  color: var(--accent-text);
}

.live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-icon);
  box-shadow: 0 0 7px rgba(129, 140, 248, 0.95);
  animation: header-pulse 1.2s infinite ease-in-out;
}

.clear-context-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 25px;
  padding: 0 9px;
  border-radius: var(--radius-sm);
  background: rgba(148, 163, 184, 0.07);
  border: 1px solid rgba(148, 163, 184, 0.16);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1;
  font-family: inherit;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    flex-shrink: 0;
  }

  &:hover {
    color: var(--danger-text);
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.28);
  }
}

.stats-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 8px;
  margin-top: -1px;
  background: var(--bg-inset);
  border: 1px solid var(--overlay-soft);
  border-radius: 7px;
}

.stat-item {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 2px 8px 2px 5px;
  border-radius: 5px;
  min-width: 0;

  & + .stat-item {
    border-left: 1px solid var(--overlay-soft);
    border-radius: 0;
    padding-left: 11px;
  }

  .stat-icon {
    display: inline-flex;
    align-self: center;
    color: var(--text-muted);
  }

  .stat-label {
    font-size: 10px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  strong {
    font-size: 11px;
    font-weight: 650;
    color: var(--text-soft);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    white-space: nowrap;
  }

  &.is-success strong {
    color: var(--success-text);
  }

  &.is-warning strong {
    color: var(--warning-text);
  }

  &.is-danger strong {
    color: var(--danger-text);
  }

  &.is-waiting strong {
    color: var(--text-secondary);
  }
}

@keyframes header-pulse {
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
  .connection-header {
    gap: 8px;
  }

  .header-copy p {
    display: none;
  }

  .clear-context-btn span {
    display: none;
  }

  .clear-context-btn {
    width: 27px;
    height: 27px;
    padding: 0;
  }

  .stats-strip {
    gap: 2px;
  }

  .stat-item {
    padding-right: 6px;
  }

  .stat-item .stat-label {
    display: none;
  }
}
</style>
