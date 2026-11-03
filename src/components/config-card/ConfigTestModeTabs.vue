<script setup lang="ts">
import { computed } from "vue";
import type { ActiveTestMode } from "../../types";
import { SegmentedControl, type SegmentedOption } from "../common";

const props = defineProps<{
  activeMode: ActiveTestMode;
  probeRunning: boolean;
  pelicanRunning: boolean;
  candyRunning?: boolean;
  connectionRunning: boolean;
}>();

const emit = defineEmits<{
  (e: "change", mode: ActiveTestMode): void;
}>();

const modeOptions = computed<SegmentedOption[]>(() => [
  {
    value: "probe",
    label: "模型测试",
    title: "三道随机题目探测，并在统一库中比对模型归因（仅匹配候选库内已收录模型，未收录模型仍会被归到最相似的现有候选）",
    indicator: props.probeRunning,
    indicatorTitle: "模型测试进行中",
  },
  {
    value: "pelican",
    label: "鹈鹕测试",
    title: "生成自行车鹈鹕 SVG 矢量图，直观测试模型是否降智",
    indicator: props.pelicanRunning,
    indicatorTitle: "鹈鹕测试进行中",
  },
  {
    value: "candy",
    label: "糖果测试",
    title: "通过 3 道动态糖果组合逻辑推理题（答对 ≥ 2 题通过），检验模型长逻辑链推理能力与是否存在降智",
    indicator: Boolean(props.candyRunning),
    indicatorTitle: "糖果测试进行中",
  },
  {
    value: "connection",
    label: "连接测试",
    title: "通过多轮对话测试接口，实时查看上游真实模型与 Token 用量",
    indicator: props.connectionRunning,
    indicatorTitle: "连接测试进行中",
  },
]);

function handleChange(value: string): void {
  emit("change", value as ActiveTestMode);
}
</script>

<template>
  <SegmentedControl
    class="test-mode-tabs"
    :model-value="activeMode"
    :options="modeOptions"
    show-dividers
    role="tablist"
    aria-label="测试类型切换"
    @change="handleChange"
  />
</template>

<style lang="scss" scoped>
.test-mode-tabs {
  margin-top: 1px;
}
</style>
