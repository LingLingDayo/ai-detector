<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import type { GlobalAnalysisResult } from "../utils/fingerprint";

const props = defineProps<{
  analysis: GlobalAnalysisResult | null;
}>();

const resultSectionRef = ref<HTMLElement | null>(null);

function percentFormat(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

watch(
  () => props.analysis,
  (newVal) => {
    if (newVal) {
      nextTick(() => {
        resultSectionRef.value?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }
);
</script>

<template>
  <section
    v-if="analysis"
    ref="resultSectionRef"
    class="card result-card"
    id="result-section"
  >
    <div class="card-header">
      <h2>归因诊断报告</h2>
      <span class="badge badge-success" title="3 题探针已完成分析与概率校准">测试已完成</span>
    </div>

    <!-- 胜出模型概览卡片 -->
    <div class="winner-hero" id="winner-hero">
      <div class="hero-item primary" title="当前候选库中后验概率最高的匹配模型">
        <span class="hero-label">最可能模型预测</span>
        <strong class="hero-val" id="winner-name">
          {{ analysis.prediction_name || analysis.prediction }}
        </strong>
        <div class="hero-prob-bar">
          <span class="hero-prob-text" id="winner-prob">
            全局概率 {{ percentFormat(analysis.probability) }}
          </span>
        </div>
      </div>
      <div class="hero-item" title="所属模型家族（GPT 系列或 Claude 系列）及综合概率">
        <span class="hero-label">识别模型家族</span>
        <strong class="hero-val" id="family-name">
          {{ analysis.family_prediction_name || analysis.family_prediction }}
        </strong>
        <span class="hero-sub" id="family-prob">
          家族综合 {{ percentFormat(analysis.family_probability) }}
        </span>
      </div>
      <div class="hero-item" title="通过长度与有效性阈值校验的有效样本数">
        <span class="hero-label">有效探针样本</span>
        <strong class="hero-val" id="valid-samples">
          {{ analysis.used_outputs }} / 3
        </strong>
        <span class="hero-sub">共 3 题测试</span>
      </div>
    </div>

    <!-- 诊断详情药丸条 -->
    <div class="diagnostics-bar" id="diagnostics-bar">
      <span
        v-for="d in analysis.diagnostics"
        :key="d.index"
        class="diag-pill"
        :class="d.accepted ? 'accepted' : 'rejected'"
        :title="`预期基准: 需至少 ${d.minimum_numbers} 个有效整数`"
      >
        测试 {{ d.index + 1 }}: {{ d.parsed_numbers }} 个数字 · {{ d.accepted ? "计入" : "忽略" }}
      </span>
    </div>

    <!-- 结果表格 -->
    <div class="table-container">
      <table class="results-table">
        <thead>
          <tr>
            <th style="width: 60px">排序</th>
            <th>候选模型</th>
            <th style="width: 130px">家族分类</th>
            <th style="width: 220px" title="全局归一化后的闭集归因概率">归因概率</th>
            <th style="width: 110px" title="特征分布与模型中心相似度">分布相似度</th>
          </tr>
        </thead>
        <tbody id="results-tbody">
          <tr
            v-for="(item, idx) in analysis.results"
            :key="item.model"
            :class="{ 'winner-row': idx === 0 }"
          >
            <td>
              <span class="rank-pill">{{ idx + 1 }}</span>
            </td>
            <td>
              <strong>{{ item.display_name }}</strong>
              <span
                v-if="idx === 0"
                class="badge badge-success"
                style="margin-left: 6px"
              >
                最佳归因
              </span>
            </td>
            <td>
              <span class="family-tag">{{ item.family_name }}</span>
            </td>
            <td>
              <div class="prob-cell">
                <div class="prob-bar-track">
                  <div
                    class="prob-bar-fill"
                    :style="{ width: `${(item.probability * 100).toFixed(1)}%` }"
                  ></div>
                </div>
                <span class="prob-val">{{ (item.probability * 100).toFixed(1) }}%</span>
              </div>
            </td>
            <td>
              <span class="similarity-val">
                {{ percentFormat(item.profile_similarity) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.result-card {
  position: relative;
  z-index: 10;
  animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  padding: 12px 15px;

  .winner-hero {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 10px;

    .hero-item {
      background: rgba(17, 23, 34, 0.7);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      justify-content: center;

      &.primary {
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(6, 182, 212, 0.08) 100%);
        border-color: rgba(99, 102, 241, 0.4);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.12);

        .hero-val {
          background: var(--accent-gradient);
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
      }

      .hero-label {
        font-size: 0.68rem;
        color: var(--text-muted);
        margin-bottom: 2px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .hero-val {
        font-size: 1.1rem;
        font-weight: 700;
        color: #fff;
        line-height: 1.2;
      }

      .hero-sub {
        font-size: 0.72rem;
        color: var(--text-secondary);
        margin-top: 2px;
      }

      .hero-prob-text {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--success);
      }
    }
  }

  .diagnostics-bar {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 10px;

    .diag-pill {
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 0.68rem;
      display: inline-flex;
      align-items: center;
      gap: 5px;

      &.accepted {
        background: var(--success-bg);
        border: 1px solid rgba(16, 185, 129, 0.3);
        color: #6ee7b7;
      }

      &.rejected {
        background: var(--danger-bg);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #fca5a5;
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
      font-size: 0.8rem;

      th {
        background: rgba(17, 23, 34, 0.95);
        color: var(--text-secondary);
        padding: 6px 10px;
        font-weight: 600;
        border-bottom: 1px solid var(--border-subtle);
        font-size: 0.72rem;
      }

      td {
        padding: 6px 10px;
        border-bottom: 1px solid rgba(35, 45, 63, 0.4);
        color: var(--text-primary);
        vertical-align: middle;
      }

      tbody tr {
        &:hover {
          background: rgba(30, 41, 59, 0.35);
        }

        &.winner-row {
          background: rgba(99, 102, 241, 0.08);

          .rank-pill {
            background: var(--accent-gradient);
            color: #fff;
          }

          .prob-val {
            color: var(--success);
          }
        }
      }

      .rank-pill {
        display: inline-flex;
        width: 18px;
        height: 18px;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 0.68rem;
        font-weight: 700;
        background: rgba(30, 41, 59, 0.6);
        color: var(--text-muted);
      }

      .family-tag {
        font-size: 0.68rem;
        padding: 1px 5px;
        border-radius: var(--radius-sm);
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid var(--border-subtle);
        color: var(--text-secondary);
      }

      .prob-cell {
        display: flex;
        align-items: center;
        gap: 8px;

        .prob-bar-track {
          flex: 1;
          height: 5px;
          background: var(--bg-input);
          border-radius: 9999px;
          overflow: hidden;

          .prob-bar-fill {
            height: 100%;
            border-radius: 9999px;
            background: var(--accent-gradient);
          }
        }

        .prob-val {
          min-width: 42px;
          text-align: right;
          font-weight: 600;
          font-size: 0.78rem;
        }
      }

      .similarity-val {
        color: var(--text-secondary);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.76rem;
      }
    }
  }
}
</style>
