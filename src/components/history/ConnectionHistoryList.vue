<script setup lang="ts">
import { computed, ref } from "vue";
import {
  CheckCircle2,
  ChevronDown,
  Database,
  Gauge,
  MessagesSquare,
  ShieldCheck,
  Timer,
  Trash2,
} from "@lucide/vue";
import type { ConnectionHistoryItem, ConnectionModelCount } from "../../types";
import { formatHistoryTime } from "../../utils/pelicanFormatters";
import {
  computeSuccessRate,
  formatCacheRate,
  formatDurationMs,
  formatFirstToken,
  formatSpeed,
  formatSuccessRate,
  formatTokenCount,
} from "../../utils/connectionMetrics";
import HistoryEmptyState from "./HistoryEmptyState.vue";

const props = withDefaults(
  defineProps<{
    connectionList: ConnectionHistoryItem[];
    activeSessionId?: string | null;
  }>(),
  {
    activeSessionId: null,
  }
);

const emit = defineEmits<{
  (e: "delete", id: string): void;
}>();

const expandedId = ref<string | null>(null);

const totalRequests = computed(() =>
  props.connectionList.reduce((total, item) => total + item.requestCount, 0)
);

function toggle(id: string): void {
  expandedId.value = expandedId.value === id ? null : id;
}

function getModelBarWidth(
  model: ConnectionModelCount,
  list: ConnectionModelCount[]
): string {
  const max = Math.max(...list.map((item) => item.count), 1);
  return `${Math.max(8, (model.count / max) * 100)}%`;
}

function formatApiFormat(apiFormat: string): string {
  if (apiFormat === "anthropic") return "Anthropic Messages";
  if (apiFormat === "responses" || apiFormat === "openai_responses") {
    return "OpenAI Responses";
  }
  return "Chat Completions";
}

function truncate(text: string, max = 80): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function getSuccessRate(item: ConnectionHistoryItem): number | null {
  if (item.successRate !== undefined) return item.successRate;
  return computeSuccessRate(
    item.successCount,
    item.errorCount,
    item.stoppedCount ?? 0
  );
}

function getSuccessTitle(item: ConnectionHistoryItem): string {
  return `成功 ${item.successCount} · 失败 ${item.errorCount} · 停止 ${item.stoppedCount ?? 0}`;
}
</script>

<template>
  <div class="connection-history-container">
    <HistoryEmptyState v-if="connectionList.length === 0" type="connection" />

    <template v-else>
      <div class="history-summary-bar">
        <span>共 {{ connectionList.length }} 个会话 · {{ totalRequests }} 次请求</span>
      </div>

      <div class="connection-history-list">
        <article
          v-for="item in connectionList"
          :key="item.id"
          class="history-card"
          :class="{
            'is-expanded': expandedId === item.id,
            'is-active-session': activeSessionId === item.id,
          }"
        >
          <div
            class="history-row"
            role="button"
            tabindex="0"
            :title="expandedId === item.id ? '收起汇总统计' : '展开汇总统计'"
            @click="toggle(item.id)"
            @keydown.enter.prevent="toggle(item.id)"
            @keydown.space.prevent="toggle(item.id)"
          >
            <div class="row-leading">
              <div class="history-icon">
                <MessagesSquare :size="15" />
              </div>
              <div class="row-main">
                <div class="title-line">
                  <span class="session-title">{{ item.title }}</span>
                  <span
                    v-if="activeSessionId === item.id"
                    class="active-session-tag"
                  >
                    <span class="active-dot"></span>
                    当前会话
                  </span>
                  <span v-if="item.mismatchCount > 0" class="route-warning-tag">
                    路由差异 {{ item.mismatchCount }}
                  </span>
                </div>
                <div class="sub-line">
                  <span>{{ formatHistoryTime(item.updatedAt) }}</span>
                  <span class="sep">·</span>
                  <span class="base-url" :title="item.baseUrl">{{ item.baseUrl || "—" }}</span>
                  <span v-if="item.configName" class="config-tag">{{ item.configName }}</span>
                </div>
              </div>
            </div>

            <div class="row-stats">
              <span class="mini-stat" :title="`成功率：${getSuccessTitle(item)}`">
                <CheckCircle2 :size="11" />
                {{ formatSuccessRate(getSuccessRate(item)) }}
              </span>
              <span class="mini-stat" title="输出速度（token/s）">
                <Gauge :size="11" />
                {{
                  item.outputSpeed && item.outputSpeed > 0
                    ? item.outputSpeed.toFixed(1)
                    : "—"
                }}
              </span>
              <span class="mini-stat" title="缓存命中率">
                <Database :size="11" />
                {{ formatCacheRate(item.cacheRate) }}
              </span>
              <span class="mini-stat" title="平均首字延迟">
                <Timer :size="11" />
                {{ formatFirstToken(item.avgFirstTokenMs) }}
              </span>
            </div>

            <div class="row-actions">
              <button
                type="button"
                class="delete-history-btn"
                title="删除此条历史记录"
                @click.stop="emit('delete', item.id)"
              >
                <Trash2 :size="12" />
              </button>
              <ChevronDown
                :size="15"
                class="expand-chevron"
                :class="{ rotated: expandedId === item.id }"
              />
            </div>
          </div>

          <div v-if="expandedId === item.id" class="detail-panel">
            <div class="model-columns">
              <section class="model-column">
                <header>
                  <span class="column-title">请求模型</span>
                  <span class="column-total">{{ item.requestCount }} 次</span>
                </header>
                <div
                  v-for="model in item.requestModelStats"
                  :key="`req-${model.model}`"
                  class="model-bar-row"
                >
                  <span class="model-name" :title="model.model">{{ model.model }}</span>
                  <span class="bar-track">
                    <span
                      class="bar-fill is-request"
                      :style="{ width: getModelBarWidth(model, item.requestModelStats) }"
                    ></span>
                  </span>
                  <span class="model-count">×{{ model.count }}</span>
                </div>
                <p v-if="item.requestModelStats.length === 0" class="column-empty">
                  暂无请求模型数据
                </p>
              </section>

              <section class="model-column">
                <header>
                  <span class="column-title">实际响应模型</span>
                  <span class="column-total">
                    {{ item.responseModelStats.reduce((sum, model) => sum + model.count, 0) }} 次
                  </span>
                </header>
                <div
                  v-for="model in item.responseModelStats"
                  :key="`res-${model.model}`"
                  class="model-bar-row"
                >
                  <span class="model-name" :title="model.model">{{ model.model }}</span>
                  <span class="bar-track">
                    <span
                      class="bar-fill is-response"
                      :style="{ width: getModelBarWidth(model, item.responseModelStats) }"
                    ></span>
                  </span>
                  <span class="model-count">×{{ model.count }}</span>
                </div>
                <p v-if="item.responseModelStats.length === 0" class="column-empty">
                  上游未返回模型信息
                </p>
              </section>
            </div>

            <div class="detail-metrics">
              <div class="metric-cell">
                <span>输入 Token</span>
                <strong>{{ formatTokenCount(item.inputTokens) }}</strong>
              </div>
              <div class="metric-cell">
                <span>输出 Token</span>
                <strong>
                  {{ item.usageEstimated ? "≈ " : "" }}{{ formatTokenCount(item.outputTokens) }}
                </strong>
              </div>
              <div class="metric-cell">
                <span>缓存读 / 写</span>
                <strong>
                  {{ formatTokenCount(item.cachedTokens) }} /
                  {{ formatTokenCount(item.cacheWriteTokens) }}
                </strong>
              </div>
              <div class="metric-cell" :title="getSuccessTitle(item)">
                <span>成功率</span>
                <strong>{{ formatSuccessRate(getSuccessRate(item)) }}</strong>
              </div>
              <div class="metric-cell">
                <span>平均首字</span>
                <strong>{{ formatFirstToken(item.avgFirstTokenMs) }}</strong>
              </div>
              <div class="metric-cell">
                <span>输出速度</span>
                <strong>{{ formatSpeed(item.outputSpeed) }}</strong>
              </div>
              <div class="metric-cell">
                <span>累计耗时</span>
                <strong>{{ formatDurationMs(item.totalDurationMs) }}</strong>
              </div>
              <div class="metric-cell">
                <span>对话轮次</span>
                <strong>{{ item.userMessageCount }} 轮</strong>
              </div>
            </div>

            <div class="detail-footer">
              <div class="footer-tags">
                <span class="footer-tag">
                  <ShieldCheck :size="11" />
                  {{ formatApiFormat(item.apiFormat) }}
                </span>
                <span class="footer-tag">{{ item.stream ? "流式请求" : "同步请求" }}</span>
                <span class="footer-tag">KEY {{ item.apiKey }}</span>
                <span v-if="item.lastRequestedModel" class="footer-tag is-model">
                  请求 {{ item.lastRequestedModel }}
                </span>
                <span v-if="item.lastResponseModel" class="footer-tag is-model">
                  响应 {{ item.lastResponseModel }}
                </span>
              </div>
              <p v-if="item.lastError" class="last-error" :title="item.lastError">
                最近错误：{{ truncate(item.lastError) }}
              </p>
            </div>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.connection-history-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 100%;
}

.history-summary-bar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 0 2px 10px;
  color: var(--text-muted);
  font-size: 11px;
}

.connection-history-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.history-card {
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-elevated);
  overflow: hidden;
  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    border-color: rgba(var(--accent-rgb), 0.28);
    background: var(--bg-control);
  }

  &.is-expanded {
    border-color: rgba(var(--accent-rgb), 0.42);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-hover);
  }

  &.is-active-session {
    border-left: 2px solid rgba(16, 185, 129, 0.65);
  }
}

.history-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 11px;
  background: transparent;
  border: none;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.row-leading {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
}

.history-icon {
  width: 27px;
  height: 27px;
  flex-shrink: 0;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--accent-rgb), 0.1);
  border: 1px solid rgba(var(--accent-rgb), 0.22);
  color: var(--accent-text);
}

.row-main {
  min-width: 0;
  flex: 1;
}

.title-line {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;

  .session-title {
    color: var(--text-body);
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.active-session-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 9999px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: var(--success-text);
  font-size: 10px;

  .active-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--success-text);
    box-shadow: 0 0 5px rgba(52, 211, 153, 0.9);
    animation: active-session-pulse 1.4s infinite ease-in-out;
  }
}

.route-warning-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 9999px;
  background: rgba(245, 158, 11, 0.11);
  border: 1px solid rgba(245, 158, 11, 0.27);
  color: var(--warning-text);
  font-size: 10px;
}

.sub-line {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 10px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;

  .sep {
    color: var(--text-placeholder);
  }

  .base-url {
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    max-width: 220px;
  }

  .config-tag {
    flex-shrink: 0;
    padding: 0 5px;
    border-radius: 3px;
    background: rgba(var(--accent-rgb), 0.1);
    border: 1px solid rgba(var(--accent-rgb), 0.2);
    color: var(--accent-text);
    font-size: 10px;
  }
}

.row-stats {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;

  .mini-stat {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--text-secondary);
    font-size: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    white-space: nowrap;

    svg {
      color: var(--text-muted);
    }
  }
}

.row-actions {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;

  .delete-history-btn {
    width: 23px;
    height: 23px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    opacity: 0;
    transition: all var(--transition-fast);

    &:hover {
      color: var(--danger-text);
      background: rgba(239, 68, 68, 0.14);
      border-color: rgba(239, 68, 68, 0.28);
    }
  }

  .expand-chevron {
    color: var(--text-muted);
    transition: transform 0.18s ease, color 0.18s ease;

    &.rotated {
      transform: rotate(180deg);
      color: var(--accent-text);
    }
  }
}

.history-card:hover .delete-history-btn,
.history-card.is-expanded .delete-history-btn {
  opacity: 1;
}

.detail-panel {
  border-top: 1px solid var(--border-subtle);
  padding: 11px 12px 10px;
  background: var(--bg-inset);
}

.model-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.model-column {
  min-width: 0;

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 7px;

    .column-title {
      color: var(--text-soft);
      font-size: 11px;
      font-weight: 600;
    }

    .column-total {
      color: var(--text-muted);
      font-size: 10px;
    }
  }
}

.model-bar-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 74px 34px;
  align-items: center;
  gap: 7px;
  margin-top: 5px;

  .model-name {
    color: var(--text-secondary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-track {
    height: 5px;
    border-radius: 9999px;
    background: var(--overlay-soft);
    overflow: hidden;
  }

  .bar-fill {
    display: block;
    height: 100%;
    border-radius: inherit;

    &.is-request {
      background: linear-gradient(90deg, var(--accent-primary), var(--accent-icon));
    }

    &.is-response {
      background: linear-gradient(90deg, var(--accent-secondary), var(--accent-sky));
    }
  }

  .model-count {
    color: var(--text-secondary);
    font-size: 10px;
    text-align: right;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
}

.column-empty {
  padding-top: 4px;
  color: var(--text-placeholder);
  font-size: 10px;
}

.detail-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--overlay-soft);

  .metric-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    span {
      color: var(--text-placeholder);
      font-size: 9px;
      white-space: nowrap;
    }

    strong {
      color: var(--text-soft);
      font-size: 11px;
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      white-space: nowrap;
    }
  }
}

.detail-footer {
  margin-top: 10px;

  .footer-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .footer-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--overlay-weak);
    border: 1px solid var(--overlay-soft);
    color: var(--text-muted);
    font-size: 10px;

    &.is-model {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
  }

  .last-error {
    margin-top: 6px;
    color: var(--danger-text);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@keyframes active-session-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

@media (max-width: 720px) {
  .row-stats {
    display: none;
  }

  .detail-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .model-columns {
    grid-template-columns: 1fr;
  }

  .sub-line .base-url {
    max-width: 130px;
  }

  .detail-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
