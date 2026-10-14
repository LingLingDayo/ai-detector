<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { PelicanHistoryItem, ProbeHistoryItem } from "../../types";
import {
  formatReasoningEffort,
  formatHistoryTime,
} from "../../utils/pelicanFormatters";
import { useClipboard } from "../../composables/useClipboard";

export type HistoryTab = "pelican" | "probe";

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    initialTab?: HistoryTab;
    pelicanList: PelicanHistoryItem[];
    probeList?: ProbeHistoryItem[];
  }>(),
  {
    isOpen: false,
    initialTab: "probe",
    pelicanList: () => [],
    probeList: () => [],
  }
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "delete-pelican", id: string): void;
  (e: "clear-pelican"): void;
  (e: "apply-pelican", item: PelicanHistoryItem): void;
  (e: "delete-probe", id: string): void;
  (e: "clear-probe"): void;
  (e: "apply-probe", item: ProbeHistoryItem): void;
}>();

const { copy: copyText } = useClipboard();

// 当前选中的 Tab 菜单，支持无缝切换与扩展
const activeTab = ref<HistoryTab>(props.initialTab);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      activeTab.value = props.initialTab || "probe";
    }
  }
);

const pelicanTotalCount = computed(() => props.pelicanList.length);
const probeTotalCount = computed(() => (props.probeList || []).length);

function handleDownloadPelican(item: PelicanHistoryItem): void {
  const isHtml = item.contentType === "html";
  const mimeType = isHtml
    ? "text/html;charset=utf-8"
    : "image/svg+xml;charset=utf-8";
  const ext = isHtml ? "html" : "svg";
  const blob = new Blob([item.content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const cleanModel = (item.modelName || "model").replace(/[^a-zA-Z0-9_-]/g, "_");
  a.href = url;
  a.download = `pelican-${cleanModel}-${item.createdAt}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleCopyPelican(item: PelicanHistoryItem): void {
  copyText(item.content);
}

function handleCopyProbeSummary(item: ProbeHistoryItem): void {
  const prob = (item.probability * 100).toFixed(1);
  const text = `【模型测试诊断结果】\n调用模型: ${item.modelName}\n判定真身: ${item.predictionName} (${prob}%)\n所属家族: ${item.familyPredictionName || "未知家族"}\n有效样本: ${item.usedOutputs}/3\n测试时间: ${formatHistoryTime(item.createdAt)}`;
  copyText(text);
}

function formatProb(prob: number | undefined): string {
  if (prob === undefined || isNaN(prob)) return "0.0%";
  return `${(prob * 100).toFixed(1)}%`;
}

function getProbBadgeClass(prob: number | undefined): string {
  if (prob === undefined) return "prob-low";
  if (prob >= 0.8) return "prob-high";
  if (prob >= 0.5) return "prob-mid";
  return "prob-low";
}

function getPureSvgContent(rawContent: string): string {
  if (!rawContent) return "";
  const trimmed = rawContent.trim();
  const svgMatch = trimmed.match(/<svg[\s\S]*?<\/svg>/i);
  let svg = svgMatch ? svgMatch[0] : trimmed;

  // 保证 SVG 在充满裁剪时不拉伸变形：强制 preserveAspectRatio="xMidYMid slice"
  svg = svg.replace(/<svg\b([^>]*)>/i, (_match, attrs) => {
    let newAttrs = attrs;
    if (!/preserveAspectRatio=/i.test(newAttrs)) {
      newAttrs += ' preserveAspectRatio="xMidYMid slice"';
    } else {
      newAttrs = newAttrs.replace(
        /preserveAspectRatio=["'][^"']*["']/i,
        'preserveAspectRatio="xMidYMid slice"'
      );
    }
    return `<svg ${newAttrs}>`;
  });
  return svg;
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="history-modal-backdrop"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
      tabindex="-1"
    >
      <div
        class="history-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-history-title"
      >
        <!-- 弹窗顶栏：标题、Tab 菜单切换栏与操作区 -->
        <header class="modal-header">
          <div class="header-left">
            <div class="header-icon-box">
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
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3 id="test-history-title">测试历史记录</h3>

            <!-- 扩展性 Tab 切换菜单：模型测试在左边，鹈鹕测试在右边 -->
            <nav class="history-tabs-nav" role="tablist" aria-label="测试类型切换">
              <button
                type="button"
                role="tab"
                class="tab-btn"
                :class="{ active: activeTab === 'probe' }"
                :aria-selected="activeTab === 'probe'"
                @click="activeTab = 'probe'"
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
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
                  <path d="M12 6a6 6 0 1 0 6 6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
                <span>模型测试</span>
                <span v-if="probeTotalCount > 0" class="tab-badge">
                  {{ probeTotalCount }}
                </span>
              </button>

              <button
                type="button"
                role="tab"
                class="tab-btn"
                :class="{ active: activeTab === 'pelican' }"
                :aria-selected="activeTab === 'pelican'"
                @click="activeTab = 'pelican'"
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
                  <circle cx="5.5" cy="17.5" r="3.5" />
                  <circle cx="18.5" cy="17.5" r="3.5" />
                  <path d="M15 6a3 3 0 1 0-3-3" />
                  <path d="M12 17.5V14l-3-3 4-3 3 3h3" />
                </svg>
                <span>鹈鹕测试</span>
                <span v-if="pelicanTotalCount > 0" class="tab-badge">
                  {{ pelicanTotalCount }}
                </span>
              </button>
            </nav>
          </div>

          <div class="header-actions">
            <!-- 模型测试清空按钮 -->
            <button
              v-if="activeTab === 'probe' && probeTotalCount > 0"
              type="button"
              class="clear-btn"
              title="清空模型测试历史"
              @click="emit('clear-probe')"
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
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>清空记录</span>
            </button>

            <!-- 鹈鹕测试清空按钮 -->
            <button
              v-else-if="activeTab === 'pelican' && pelicanTotalCount > 0"
              type="button"
              class="clear-btn"
              title="清空鹈鹕测试历史"
              @click="emit('clear-pelican')"
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
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>清空记录</span>
            </button>

            <!-- 关闭弹窗按钮 -->
            <button
              type="button"
              class="close-btn"
              aria-label="关闭弹窗"
              @click="emit('close')"
            >
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <!-- 弹窗内容主体 -->
        <main class="modal-body">
          <!-- 1. 模型测试历史视图（左侧默认 Tab） -->
          <section v-if="activeTab === 'probe'" class="tab-content-section">
            <!-- 空状态 -->
            <div v-if="probeTotalCount === 0" class="empty-state">
              <div class="empty-icon-wrap probe-icon-wrap">
                <svg
                  viewBox="0 0 24 24"
                  width="40"
                  height="40"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                  <path d="M2 12h20" />
                </svg>
              </div>
              <p class="empty-title">暂无模型测试历史记录</p>
              <p class="empty-desc">
                在“模型测试”模式中，完成探测并生成模型归因诊断后，记录将自动保存在这里。
              </p>
            </div>

            <!-- 两列布局的模型测试卡片网格 -->
            <div v-else class="probe-history-grid">
              <article
                v-for="item in probeList"
                :key="item.id"
                class="probe-card-item"
              >
                <!-- 卡片内容主体（点击将此诊断结果回填至主界面查看） -->
                <div
                  class="probe-stage"
                  @click="emit('apply-probe', item)"
                  title="点击将此诊断结果载入主界面查看"
                >
                  <!-- 背景微光矩阵 -->
                  <div class="probe-bg-mesh"></div>

                  <!-- 诊断内容核心区域：直观、简洁、高质感 -->
                  <div class="probe-card-body">
                    <!-- 核心诊断行：胜出模型与判定置信度 -->
                    <div class="probe-header-row">
                      <div class="winner-box">
                        <span class="winner-sub">模型指纹判定</span>
                        <h4 class="winner-title" :title="item.predictionName">
                          {{ item.predictionName }}
                        </h4>
                      </div>
                      <div
                        class="prob-pill"
                        :class="getProbBadgeClass(item.probability)"
                      >
                        <span class="prob-num">{{ formatProb(item.probability) }}</span>
                        <span class="prob-label">匹配</span>
                      </div>
                    </div>

                    <!-- 家族属性与样本信息 -->
                    <div class="probe-meta-line">
                      <span class="family-badge" :title="`归属家族: ${item.familyPredictionName}`">
                        <span class="family-dot"></span>
                        <span class="family-text">{{ item.familyPredictionName || '通用系列' }}</span>
                      </span>
                      <span class="samples-badge">
                        样本 {{ item.usedOutputs }}/3 题
                      </span>
                    </div>

                    <!-- Top 候选模型比例条对比（最关键信息：直观一眼区分真身与备选差距） -->
                    <div
                      v-if="item.candidates && item.candidates.length > 0"
                      class="probe-chart-box"
                    >
                      <div class="chart-progress-bar">
                        <div
                          v-for="(cand, idx) in item.candidates.slice(0, 3)"
                          :key="cand.model"
                          class="chart-slice"
                          :class="`slice-${idx}`"
                          :style="{ width: `${Math.max(cand.probability * 100, 5)}%` }"
                          :title="`${cand.displayName}: ${(cand.probability * 100).toFixed(1)}%`"
                        ></div>
                      </div>
                      <div class="chart-labels">
                        <div
                          v-for="(cand, idx) in item.candidates.slice(0, 2)"
                          :key="cand.model"
                          class="label-item"
                          :class="`cand-${idx}`"
                        >
                          <span class="cand-dot"></span>
                          <span class="cand-name" :title="cand.displayName">{{ cand.displayName }}</span>
                          <span class="cand-val">{{ (cand.probability * 100).toFixed(0) }}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 左上角显示调用模型名（与鹈鹕完全对齐：通透半透明，无 icon，默认显示） -->
                <div class="model-tag" :title="item.modelName">
                  <span class="model-tag-text">{{ item.modelName }}</span>
                </div>

                <!-- 右上角信息 icon 与 Hover 详细信息浮层（与鹈鹕完全对齐） -->
                <div class="info-icon-wrapper">
                  <button
                    type="button"
                    class="info-action-btn"
                    aria-label="查看详细参数"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </button>

                  <!-- Hover 详细信息浮层 -->
                  <div class="info-tooltip-popover" role="tooltip">
                    <div class="popover-header">
                      <span class="popover-title">测试参数与详情</span>
                    </div>
                    <div class="popover-list">
                      <!-- 配置名称 -->
                      <div v-if="item.configName" class="popover-item">
                        <span class="item-label">配置名称</span>
                        <span class="item-value config-name-badge">
                          {{ item.configName }}
                        </span>
                      </div>

                      <!-- 完整 baseurl -->
                      <div class="popover-item">
                        <span class="item-label">Base URL</span>
                        <span
                          class="item-value font-mono break-all selectable"
                          :title="item.baseUrl"
                        >
                          {{ item.baseUrl }}
                        </span>
                      </div>

                      <!-- 省略中间部分的 key（在存储时就已脱敏） -->
                      <div class="popover-item">
                        <span class="item-label">API Key</span>
                        <span class="item-value font-mono">
                          {{ item.apiKey }}
                        </span>
                      </div>

                      <!-- 调用模型 -->
                      <div class="popover-item">
                        <span class="item-label">调用模型</span>
                        <span class="item-value model-highlight">
                          {{ item.modelName }}
                        </span>
                      </div>

                      <!-- 思考强度 -->
                      <div class="popover-item">
                        <span class="item-label">思考强度</span>
                        <span class="item-value">
                          {{ formatReasoningEffort(item.reasoningEffort) }}
                        </span>
                      </div>

                      <!-- 识别结论 -->
                      <div class="popover-item">
                        <span class="item-label">识别真身</span>
                        <span class="item-value winner-highlight">
                          {{ item.predictionName }} ({{ formatProb(item.probability) }})
                        </span>
                      </div>

                      <!-- 模型家族 -->
                      <div class="popover-item">
                        <span class="item-label">模型家族</span>
                        <span class="item-value">
                          {{ item.familyPredictionName }} ({{ formatProb(item.familyProbability) }})
                        </span>
                      </div>

                      <!-- 测试时间 -->
                      <div v-if="item.createdAt" class="popover-item">
                        <span class="item-label">测试时间</span>
                        <span class="item-value text-muted">
                          {{ formatHistoryTime(item.createdAt) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 浮于卡片底部的快捷操作栏（默认隐藏，hover 时显现，与鹈鹕完全对齐） -->
                <footer class="card-footer">
                  <span class="time-label">{{ formatHistoryTime(item.createdAt) }}</span>
                  <div class="footer-btns">
                    <button
                      type="button"
                      class="tool-btn"
                      title="复制诊断结论"
                      @click.stop="handleCopyProbeSummary(item)"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="tool-btn delete-tool-btn"
                      title="删除此条记录"
                      @click.stop="emit('delete-probe', item.id)"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </footer>
              </article>
            </div>
          </section>

          <!-- 2. 鹈鹕测试历史视图 -->
          <section v-else-if="activeTab === 'pelican'" class="tab-content-section">
            <!-- 空状态 -->
            <div v-if="pelicanTotalCount === 0" class="empty-state">
              <div class="empty-icon-wrap">
                <svg
                  viewBox="0 0 24 24"
                  width="40"
                  height="40"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <p class="empty-title">暂无鹈鹕测试历史记录</p>
              <p class="empty-desc">
                在“鹈鹕测试”模式中，AI 模型成功生成的图片将会自动保存在这里。
              </p>
            </div>

            <!-- 两列布局的图片网格 -->
            <div v-else class="pelican-history-grid">
              <article
                v-for="item in pelicanList"
                :key="item.id"
                class="pelican-card-item"
              >
                <!-- 1. 图片展示区域（纯原生矢量 SVG 渲染，占满卡片，自动裁剪且不拉伸变形） -->
                <div
                  class="image-stage"
                  @click="emit('apply-pelican', item)"
                  title="点击将此图片载入主界面查看"
                >
                  <div
                    class="svg-viewport"
                    v-html="getPureSvgContent(item.content)"
                  ></div>
                </div>

                <!-- 2. 左上角显示调用模型名（更通透透明，无 icon） -->
                <div class="model-tag" :title="item.modelName">
                  <span class="model-tag-text">{{ item.modelName }}</span>
                </div>

                <!-- 右上角合适位置的信息 icon，hover 上去能够显示详细信息浮层 -->
                <div class="info-icon-wrapper">
                  <button
                    type="button"
                    class="info-action-btn"
                    aria-label="查看详细参数"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </button>

                  <!-- Hover 详细信息浮层 -->
                  <div class="info-tooltip-popover" role="tooltip">
                    <div class="popover-header">
                      <span class="popover-title">测试参数详情</span>
                    </div>
                    <div class="popover-list">
                      <!-- 配置名称[如果是保存的配置] -->
                      <div v-if="item.configName" class="popover-item">
                        <span class="item-label">配置名称</span>
                        <span class="item-value config-name-badge">
                          {{ item.configName }}
                        </span>
                      </div>

                      <!-- 完整 baseurl -->
                      <div class="popover-item">
                        <span class="item-label">Base URL</span>
                        <span
                          class="item-value font-mono break-all selectable"
                          :title="item.baseUrl"
                        >
                          {{ item.baseUrl }}
                        </span>
                      </div>

                      <!-- 省略中间部分的 key（在存储时就已脱敏省略中间部分） -->
                      <div class="popover-item">
                        <span class="item-label">API Key</span>
                        <span class="item-value font-mono">
                          {{ item.apiKey }}
                        </span>
                      </div>

                      <!-- 模型 -->
                      <div class="popover-item">
                        <span class="item-label">调用模型</span>
                        <span class="item-value model-highlight">
                          {{ item.modelName }}
                        </span>
                      </div>

                      <!-- 思考强度 -->
                      <div class="popover-item">
                        <span class="item-label">思考强度</span>
                        <span class="item-value">
                          {{ formatReasoningEffort(item.reasoningEffort) }}
                        </span>
                      </div>

                      <!-- 生成时间 -->
                      <div v-if="item.createdAt" class="popover-item">
                        <span class="item-label">生成时间</span>
                        <span class="item-value text-muted">
                          {{ formatHistoryTime(item.createdAt) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 4. 浮于图片上方的底栏快捷操作（默认隐藏，hover 时显现） -->
                <footer class="card-footer">
                  <span class="time-label">{{ formatHistoryTime(item.createdAt) }}</span>
                  <div class="footer-btns">
                    <button
                      type="button"
                      class="tool-btn"
                      title="复制图形代码"
                      @click.stop="handleCopyPelican(item)"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="tool-btn"
                      title="下载图片文件"
                      @click.stop="handleDownloadPelican(item)"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="tool-btn delete-tool-btn"
                      title="删除此条记录"
                      @click.stop="emit('delete-pelican', item.id)"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </footer>
              </article>
            </div>
          </section>
        </main>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
/* 弹窗遮罩 */
.history-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 7, 13, 0.84);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
  animation: fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 对话框主体 */
.history-modal-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 860px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 28px 56px rgba(0, 0, 0, 0.82), 0 0 32px rgba(99, 102, 241, 0.18);
  animation: modalScaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

/* 顶栏 */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(15, 23, 42, 0.75);
  gap: 16px;

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;

    .header-icon-box {
      width: 30px;
      height: 30px;
      border-radius: var(--radius-sm);
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: #818cf8;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    h3 {
      font-size: 0.96rem;
      font-weight: 600;
      color: #fff;
      margin: 0;
      white-space: nowrap;
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;

    .clear-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: var(--radius-sm);
      color: #fca5a5;
      font-size: 0.74rem;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(239, 68, 68, 0.2);
        border-color: rgba(239, 68, 68, 0.45);
        color: #fee2e2;
      }
    }

    .close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }
    }
  }
}

/* Tab 切换导航条 */
.history-tabs-nav {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(15, 23, 42, 0.85);
  padding: 3px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.08);

  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-size: 0.74rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.18s ease;
    white-space: nowrap;

    &:hover {
      color: #e2e8f0;
      background: rgba(255, 255, 255, 0.05);
    }

    &.active {
      color: #fff;
      background: rgba(99, 102, 241, 0.3);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    }

    .tab-badge {
      font-size: 0.65rem;
      padding: 0 5px;
      border-radius: 9999px;
      background: rgba(99, 102, 241, 0.35);
      color: #c7d2fe;
      line-height: 1.4;

      &.plan-tag {
        background: rgba(148, 163, 184, 0.18);
        color: #94a3b8;
      }
    }
  }
}

/* 内容主体 */
.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  min-height: 340px;
}

.tab-content-section {
  display: flex;
  flex-direction: column;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 20px;
  gap: 10px;

  .empty-icon-wrap {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.08);
    border: 1px dashed rgba(99, 102, 241, 0.25);
    color: #818cf8;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 6px;

    &.probe-icon-wrap {
      background: rgba(56, 189, 248, 0.08);
      border-color: rgba(56, 189, 248, 0.25);
      color: #38bdf8;
    }
  }

  .empty-title {
    font-size: 0.92rem;
    font-weight: 600;
    color: #e2e8f0;
    margin: 0;
  }

  .empty-desc {
    font-size: 0.78rem;
    color: var(--text-secondary);
    max-width: 360px;
    line-height: 1.5;
    margin: 0;
  }
}

/* 鹈鹕两列图片网格 */
.pelican-history-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}

/* 单张卡片项：固定接近 4:3 比例，占满整张卡片，多出裁剪，不拉伸变形 */
.pelican-card-item {
  position: relative;
  background: #090e1a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  aspect-ratio: 4 / 3;
  overflow: visible; /* 保证 hover 浮层正常弹出不被裁切 */
  transition: all 0.22s ease;
  display: block;

  &:hover {
    border-color: rgba(99, 102, 241, 0.45);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
  }
}

/* 左上角模型名：更通透半透明，无 icon，默认显示 */
.model-tag {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 9999px;
  background: rgba(15, 23, 42, 0.38); /* 更加透明轻盈 */
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(241, 245, 249, 0.88);
  font-size: 0.68rem;
  font-weight: 500;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  max-width: 65%;
  pointer-events: none; /* 穿透不遮挡图片点击 */

  .model-tag-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* 右上角信息 icon 与 Hover 详细信息浮层：默认隐藏，只有 hover 卡片时显示 */
.info-icon-wrapper {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 25;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-3px);
  transition: opacity 0.2s ease, transform 0.2s ease;

  .info-action-btn {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: rgba(17, 24, 39, 0.85);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    transition: all 0.2s ease;

    &:hover,
    &:focus {
      color: #818cf8;
      border-color: rgba(99, 102, 241, 0.5);
      background: rgba(30, 41, 59, 0.95);
      transform: scale(1.08);
    }
  }

  /* 悬浮详细参数卡片 */
  .info-tooltip-popover {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 290px;
    background: #0f172a;
    border: 1px solid rgba(99, 102, 241, 0.4);
    border-radius: var(--radius-sm);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.85), 0 0 16px rgba(99, 102, 241, 0.25);
    padding: 12px;
    z-index: 100;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-6px);
    transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s;
    pointer-events: none;

    .popover-header {
      padding-bottom: 8px;
      margin-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);

      .popover-title {
        font-size: 0.76rem;
        font-weight: 600;
        color: #e2e8f0;
      }
    }

    .popover-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .popover-item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      font-size: 0.72rem;

      .item-label {
        color: var(--text-secondary);
        flex-shrink: 0;
      }

      .item-value {
        color: #f1f5f9;
        text-align: right;
        word-break: break-all;

        &.config-name-badge {
          color: #a5b4fc;
          font-weight: 600;
          background: rgba(99, 102, 241, 0.15);
          padding: 1px 6px;
          border-radius: 4px;
        }

        &.model-highlight {
          color: #38bdf8;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }

        &.winner-highlight {
          color: #34d399;
          font-weight: 600;
        }

        &.font-mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }

        &.selectable {
          user-select: text;
        }

        &.text-muted {
          color: var(--text-muted);
        }
      }
    }
  }

  /* 悬停或聚焦显示浮层 */
  &:hover .info-tooltip-popover,
  &:focus-within .info-tooltip-popover {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
    pointer-events: auto;
  }
}

/* 卡片 hover 时展示右上角详情 icon */
.pelican-card-item:hover .info-icon-wrapper,
.probe-card-item:hover .info-icon-wrapper,
.info-icon-wrapper:focus-within {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

/* 图片展示主舞台：占满整张卡片全部，内部裁切溢出，SVG 充满且保持宽高比不拉伸变形 */
.image-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-md);
  overflow: hidden; /* 多出的部分裁剪，不拉伸变形 */
  background: radial-gradient(circle at center, #162035 0%, #090e1a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease;

  .svg-viewport {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;

    :deep(svg) {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4));
      user-select: none;
    }
  }
}

/* 卡片底栏操作区：浮在图片上方，默认隐藏，只有 hover 时才显示 */
.card-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 12px 10px;
  background: linear-gradient(to top, rgba(9, 14, 26, 0.94) 0%, rgba(9, 14, 26, 0.62) 65%, transparent 100%);
  border-bottom-left-radius: var(--radius-md);
  border-bottom-right-radius: var(--radius-md);
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition: opacity 0.2s ease, transform 0.2s ease;

  .time-label {
    font-size: 0.68rem;
    color: rgba(226, 232, 240, 0.75);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  }

  .footer-btns {
    display: flex;
    align-items: center;
    gap: 6px;

    .tool-btn {
      width: 24px;
      height: 24px;
      border-radius: var(--radius-sm);
      background: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.18s ease;

      &:hover {
        background: rgba(99, 102, 241, 0.25);
        border-color: rgba(99, 102, 241, 0.5);
        color: #fff;
      }

      &.delete-tool-btn:hover {
        background: rgba(239, 68, 68, 0.25);
        border-color: rgba(239, 68, 68, 0.5);
        color: #fca5a5;
      }
    }
  }
}

/* 卡片 hover 时显示底栏 */
.pelican-card-item:hover .card-footer,
.probe-card-item:hover .card-footer {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

/* ==========================================================================
   模型测试卡片网格与卡片样式（简洁直观、富有设计感、与鹈鹕测试对称一致）
   ========================================================================== */

/* 模型测试两列卡片网格 */
.probe-history-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}

/* 模型测试卡片项：固定 4:3 比例，和鹈鹕卡片完全对齐 */
.probe-card-item {
  position: relative;
  background: #090e1a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  aspect-ratio: 4 / 3;
  overflow: visible; /* 保证 hover 浮层正常弹出不被裁切 */
  transition: all 0.22s ease;
  display: block;

  &:hover {
    border-color: rgba(99, 102, 241, 0.45);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
  }
}

/* 卡片主体舞台 */
.probe-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: radial-gradient(circle at 85% 15%, rgba(99, 102, 241, 0.16) 0%, rgba(13, 20, 36, 0.96) 65%, #080c16 100%);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: background 0.25s ease;

  &:hover {
    background: radial-gradient(circle at 85% 15%, rgba(99, 102, 241, 0.24) 0%, rgba(15, 23, 42, 0.98) 65%, #090d18 100%);
  }

  .probe-bg-mesh {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.28;
    background-image: radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px);
    background-size: 14px 14px;
    mask-image: radial-gradient(ellipse at 50% 50%, black 40%, transparent 80%);
    -webkit-mask-image: radial-gradient(ellipse at 50% 50%, black 40%, transparent 80%);
  }

  .probe-card-body {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 38px 14px 44px;
    box-sizing: border-box;
  }
}

/* 核心诊断行 */
.probe-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;

  .winner-box {
    flex: 1;
    min-width: 0;

    .winner-sub {
      display: block;
      font-size: 0.65rem;
      color: #94a3b8;
      letter-spacing: 0.04em;
      margin-bottom: 2px;
    }

    .winner-title {
      font-size: 1.08rem;
      font-weight: 700;
      margin: 0;
      line-height: 1.25;
      color: #f8fafc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: linear-gradient(135deg, #ffffff 40%, #c7d2fe 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
  }

  .prob-pill {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    border: 1px solid transparent;

    .prob-num {
      font-size: 0.86rem;
      font-weight: 700;
      line-height: 1.1;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .prob-label {
      font-size: 0.58rem;
      line-height: 1;
      opacity: 0.85;
      margin-top: 1px;
    }

    &.prob-high {
      background: rgba(16, 185, 129, 0.14);
      border-color: rgba(16, 185, 129, 0.35);
      color: #34d399;
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.12);
    }

    &.prob-mid {
      background: rgba(99, 102, 241, 0.16);
      border-color: rgba(99, 102, 241, 0.35);
      color: #a5b4fc;
      box-shadow: 0 0 10px rgba(99, 102, 241, 0.12);
    }

    &.prob-low {
      background: rgba(245, 158, 11, 0.14);
      border-color: rgba(245, 158, 11, 0.35);
      color: #fbbf24;
    }
  }
}

/* 家族属性与样本数 */
.probe-meta-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;

  .family-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.7rem;
    color: #93c5fd;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    padding: 2px 7px;
    border-radius: 9999px;
    max-width: 60%;
    overflow: hidden;

    .family-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #60a5fa;
      flex-shrink: 0;
    }

    .family-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .samples-badge {
    font-size: 0.68rem;
    color: var(--text-muted);
    background: rgba(255, 255, 255, 0.04);
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
  }
}

/* Top 候选比例条对比 */
.probe-chart-box {
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-sm);
  padding: 6px 8px;

  .chart-progress-bar {
    display: flex;
    height: 5px;
    border-radius: 9999px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.08);
    gap: 1.5px;

    .chart-slice {
      height: 100%;
      transition: width 0.3s ease;

      &.slice-0 {
        background: linear-gradient(90deg, #6366f1, #38bdf8);
      }
      &.slice-1 {
        background: linear-gradient(90deg, #ec4899, #f43f5e);
      }
      &.slice-2 {
        background: #64748b;
      }
    }
  }

  .chart-labels {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    .label-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.66rem;
      min-width: 0;

      .cand-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .cand-name {
        color: #cbd5e1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 90px;
      }

      .cand-val {
        color: #94a3b8;
        font-family: ui-monospace, SFMono-Regular, monospace;
        flex-shrink: 0;
      }

      &.cand-0 .cand-dot {
        background: #38bdf8;
        box-shadow: 0 0 5px rgba(56, 189, 248, 0.5);
      }
      &.cand-1 .cand-dot {
        background: #ec4899;
        box-shadow: 0 0 5px rgba(236, 72, 153, 0.5);
      }
    }
  }
}
</style>
