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
        挑战 {{ d.index + 1 }}: {{ d.parsed_numbers }} 个数字 · {{ d.accepted ? "计入" : "忽略" }}
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
