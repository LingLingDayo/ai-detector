<script setup lang="ts">
import { computed } from "vue";
import { Copy, Check, Info } from "@lucide/vue";
import type { CandyAnalysisResult, CandyHistoryItem } from "../types";
import { useClipboard } from "../composables/useClipboard";
import { formatHistoryTime } from "../utils/pelicanFormatters";
import { formatDurationMs } from "../utils/connectionMetrics";
import { useCandyTestStore } from "../stores";

const candyStore = useCandyTestStore();

const props = defineProps<{
  analysis: CandyAnalysisResult | null;
  historyItem?: CandyHistoryItem | null;
  modelName?: string;
}>();

const { copied, copy } = useClipboard();

const displayModelName = computed(() => {
  return (
    props.historyItem?.modelName?.trim() ||
    props.modelName?.trim() ||
    candyStore.testedModel?.trim() ||
    ""
  );
});

const displayVerdict = computed(() => {
  const baseVerdict = props.analysis?.passed ? "测试通过" : "测试未通过";
  return displayModelName.value ? `${displayModelName.value} ${baseVerdict}` : baseVerdict;
});

function percentFormat(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function getVerdictSubtext(analysis: CandyAnalysisResult): string {
  if (analysis.correctCount >= analysis.totalCount) {
    return "满分通过 · 长逻辑链推理完整";
  }
  if (analysis.passed) {
    return `达标通过 · 答对 ${analysis.correctCount}/${analysis.totalCount} 题`;
  }
  if (analysis.correctCount === 1) {
    return "未达标 · 疑似降智或推理偶发截断";
  }
  return "未通过 · 疑似严重降智或思考链被截断";
}

function handleCopyResult(): void {
  if (!props.analysis) return;
  const item = props.historyItem;
  const modelName = displayModelName.value || "未知模型";
  const verdict = props.analysis.passed ? "测试通过" : "测试未通过";
  const acc = percentFormat(props.analysis.accuracy);
  const details = props.analysis.diagnostics
    .map(
      (d) =>
        `第${d.index + 1}题: 答案 ${d.expectedAnswer} / 回答 ${d.modelAnswer ?? "未识别"} (${d.isCorrect ? "正确" : "错误"})`
    )
    .join("\n");
  const timeStr = formatHistoryTime(item?.createdAt || Date.now());

  const text = `【糖果测试诊断结果】\n调用模型: ${modelName}\n测试结论: ${verdict} (${props.analysis.correctCount}/${props.analysis.totalCount}，准确率 ${acc})\n平均耗时: ${formatDurationMs(props.analysis.avgDurationMs)}\n${details}\n测试时间: ${timeStr}`;
  copy(text);
}
</script>

<template>
  <section
    v-if="analysis"
    class="card result-card candy-result-card"
    id="candy-result-section"
  >
    <div class="card-header">
      <div class="header-title-group">
        <h2 title="通过 3 道动态糖果组合逻辑题，检验模型长逻辑链推理能力并判断是否存在降智">
          糖果测试诊断报告
        </h2>
        <span
          class="candidate-scope-badge"
          title="连续 3 道题中答对 2 题及以上即判定通过"
        >
          <Info :size="11" class="badge-icon" />
          <span>3 题答对 ≥ 2 题即通过</span>
        </span>
      </div>
      <button
        type="button"
        class="btn-copy-result"
        :class="{ copied }"
        :title="copied ? '已复制诊断结果' : '复制诊断结果'"
        @click="handleCopyResult"
      >
        <Check v-if="copied" :size="13" />
        <Copy v-else :size="13" />
      </button>
    </div>

    <!-- 核心结论概览卡片 -->
    <div class="winner-hero" id="candy-winner-hero">
      <div
        class="hero-item"
        :class="analysis.passed ? 'primary passed' : 'failed'"
        title="连续 3 题答对 ≥ 2 题即为测试通过"
      >
        <span class="hero-label">智力测试结论</span>
        <strong class="hero-val">
          {{ displayVerdict }}
        </strong>
        <div class="hero-prob-bar">
          <span class="hero-prob-text">
            {{ getVerdictSubtext(analysis) }}
          </span>
        </div>
      </div>

      <div class="hero-item" title="3 道动态糖果题的正确题数与准确率">
        <span class="hero-label">正确题数 / 准确率</span>
        <strong class="hero-val">
          {{ analysis.correctCount }} / {{ analysis.totalCount }}
        </strong>
        <span class="hero-sub">
          准确率 {{ percentFormat(analysis.accuracy) }}（需 ≥ 2 题）
        </span>
      </div>

      <div class="hero-item" title="每道题的平均思考与生成耗时">
        <span class="hero-label">平均响应耗时</span>
        <strong class="hero-val">
          {{ formatDurationMs(analysis.avgDurationMs) }}
        </strong>
        <span class="hero-sub">
          总计耗时 {{ formatDurationMs(analysis.totalDurationMs) }}
        </span>
      </div>
    </div>

    <!-- 诊断详情药丸条 -->
    <div class="diagnostics-bar" id="candy-diagnostics-bar">
      <span
        v-for="d in analysis.diagnostics"
        :key="d.index"
        class="diag-pill clickable"
        :class="d.isCorrect ? 'accepted' : 'rejected'"
        title="点击查看该题完整题目、正确答案与模型推理过程"
        @click="candyStore.openDetailModal(d.index)"
      >
        测试 {{ d.index + 1 }}: 答案 {{ d.expectedAnswer }} / 回答 {{ d.modelAnswer ?? "未识别" }} · {{ d.isCorrect ? "正确" : "错误" }}
      </span>
    </div>

    <!-- 3 题明细对比表格 -->
    <div class="table-container">
      <table class="results-table">
        <thead>
          <tr>
            <th style="width: 84px">题号</th>
            <th style="min-width: 210px">糖果数量分布 (圆形 / 五角星)</th>
            <th style="width: 125px">正确答案 (最优解)</th>
            <th style="width: 72px; text-align: center">模型答案</th>
            <th style="width: 78px; text-align: center">响应耗时</th>
            <th style="width: 88px; text-align: center">判定结果</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="d in analysis.diagnostics"
            :key="d.index"
            class="clickable-row"
            :class="{ 'winner-row': d.isCorrect }"
            title="点击查看此题详细 Prompt 与模型完整回复"
            @click="candyStore.openDetailModal(d.index)"
          >
            <td>
              <div class="test-index-cell">
                <span class="rank-pill">{{ d.index + 1 }}</span>
                <span class="test-index-label">测试 {{ d.index + 1 }}</span>
              </div>
            </td>
            <td>
              <span class="dist-tag">
                圆(苹{{ d.circleApple }}·桃{{ d.circlePeach }}·瓜{{ d.circleWatermelon }}) /
                星(苹{{ d.starApple }}·桃{{ d.starPeach }}·瓜{{ d.starWatermelon }})
              </span>
            </td>
            <td style="white-space: nowrap">
              <strong class="expected-val">{{ d.expectedAnswer }}</strong>
              <span class="optimal-sub">
                (圆{{ d.optimalCircle }}+星{{ d.optimalStar }})
              </span>
            </td>
            <td style="text-align: center">
              <strong
                class="model-ans-val"
                :class="d.isCorrect ? 'ans-correct' : 'ans-wrong'"
              >
                {{ d.modelAnswer ?? "未识别" }}
              </strong>
            </td>
            <td style="text-align: center">
              <span class="similarity-val">{{ formatDurationMs(d.durationMs) }}</span>
            </td>
            <td style="text-align: center">
              <span
                class="verdict-badge"
                :class="d.isCorrect ? 'verdict-pass' : 'verdict-fail'"
              >
                {{ d.isCorrect ? "回答正确" : d.answer ? "回答错误" : "请求失败" }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.candy-result-card {
  position: relative;
  z-index: 10;
  animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  padding: 12px 15px;

  .card-header {
    .header-title-group {
      display: flex;
      align-items: center;
      gap: 8px;

      h2 {
        cursor: help;
      }

      .candidate-scope-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 7px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 500;
        background: rgba(99, 102, 241, 0.1);
        border: 1px solid rgba(99, 102, 241, 0.25);
        color: var(--accent-text);
        cursor: help;
        line-height: 1.2;
      }
    }

    .btn-copy-result {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      background: var(--overlay-weak);
      border: 1px solid var(--overlay-medium);
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0.75;
      transition: all 0.18s ease;

      &:hover {
        background: var(--overlay-strong);
        color: var(--text-strong);
        border-color: var(--border-subtle);
        opacity: 1;
      }

      &.copied {
        background: rgba(16, 185, 129, 0.15);
        border-color: rgba(16, 185, 129, 0.35);
        color: var(--success-text);
        opacity: 1;
      }
    }
  }

  .winner-hero {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 10px;

    .hero-item {
      background: var(--bg-panel);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      justify-content: center;

      &.primary.passed {
        background: linear-gradient(
          135deg,
          rgba(16, 185, 129, 0.15) 0%,
          rgba(99, 102, 241, 0.08) 100%
        );
        border-color: rgba(16, 185, 129, 0.4);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.1);

        .hero-val {
          color: var(--success);
        }

        .hero-prob-text {
          color: var(--success);
        }
      }

      &.failed {
        background: linear-gradient(
          135deg,
          rgba(239, 68, 68, 0.14) 0%,
          rgba(245, 158, 11, 0.08) 100%
        );
        border-color: rgba(239, 68, 68, 0.4);
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.1);

        .hero-val {
          color: var(--danger);
        }

        .hero-prob-text {
          color: var(--danger-text);
        }
      }

      .hero-label {
        font-size: 11px;
        color: var(--text-muted);
        margin-bottom: 2px;
        letter-spacing: 0.04em;
      }

      .hero-val {
        font-size: 17px;
        font-weight: 700;
        color: var(--text-strong);
        line-height: 1.25;
        word-break: break-word;
      }

      .hero-sub {
        font-size: 12px;
        color: var(--text-secondary);
        margin-top: 2px;
      }

      .hero-prob-text {
        font-size: 12px;
        font-weight: 600;
      }
    }
  }

  .diagnostics-bar {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 10px;

    .diag-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      line-height: 1;
      gap: 5px;
      transition: all var(--transition-fast);

      &.clickable {
        cursor: pointer;

        &:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
          filter: brightness(1.15);
        }
      }

      &.accepted {
        background: var(--success-bg);
        border: 1px solid rgba(16, 185, 129, 0.3);
        color: var(--success-text);
      }

      &.rejected {
        background: var(--danger-bg);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: var(--danger-text);
      }
    }
  }

  .table-container {
    overflow-x: auto;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);

    .results-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;

      th {
        background: var(--bg-elevated-strong);
        color: var(--text-secondary);
        padding: 6px 10px;
        font-weight: 600;
        border-bottom: 1px solid var(--border-subtle);
        font-size: 12px;
        white-space: nowrap;
      }

      td {
        padding: 6px 10px;
        border-bottom: 1px solid var(--border-subtle);
        color: var(--text-primary);
        vertical-align: middle;
      }

      tbody tr {
        &.clickable-row {
          cursor: pointer;
        }

        &:hover {
          background: var(--bg-control);
        }

        &.winner-row {
          background: rgba(16, 185, 129, 0.05);

          .rank-pill {
            background: var(--success);
            color: #fff;
          }
        }
      }

      .test-index-cell {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;

        .test-index-label {
          font-weight: 600;
          font-size: 13px;
        }
      }

      .rank-pill {
        display: inline-flex;
        width: 18px;
        height: 18px;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 11px;
        font-weight: 700;
        background: var(--bg-control-strong);
        color: var(--text-muted);
        flex-shrink: 0;
      }

      .dist-tag {
        font-size: 12px;
        color: var(--text-secondary);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        white-space: nowrap;
      }

      .expected-val {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-strong);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }

      .optimal-sub {
        font-size: 11px;
        color: var(--text-muted);
        margin-left: 4px;
      }

      .model-ans-val {
        font-size: 13px;
        font-weight: 700;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

        &.ans-correct {
          color: var(--success);
        }

        &.ans-wrong {
          color: var(--danger);
        }
      }

      .similarity-val {
        color: var(--text-secondary);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
      }

      .verdict-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 7px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;

        &.verdict-pass {
          background: rgba(16, 185, 129, 0.14);
          border: 1px solid rgba(16, 185, 129, 0.3);
          color: var(--success-text);
        }

        &.verdict-fail {
          background: rgba(239, 68, 68, 0.14);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: var(--danger-text);
        }
      }
    }
  }
}
</style>
