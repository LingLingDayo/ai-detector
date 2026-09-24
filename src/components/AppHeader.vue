<script setup lang="ts">
import logoUrl from "../assets/logo.png";

withDefaults(
  defineProps<{
    modelCount?: number;
  }>(),
  {
    modelCount: 13,
  }
);
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <div class="brand-icon" title="ModelTrace AI 探测器">
        <img :src="logoUrl" alt="ModelTrace Logo" class="brand-logo-img" />
      </div>
      <div>
        <h1 class="brand-title">ModelTrace <span>AI Detector</span></h1>
        <p class="brand-subtitle" title="通过探针测试，检测并鉴别 API 底层实际调用的真实大模型">
          检测与鉴别 API 背后的真实大模型
        </p>
      </div>
    </div>
    <div class="header-badges">
      <span class="badge" id="bank-badge" :title="`当前指纹库已收录 ${modelCount} 个主流前沿模型`">
        <span class="badge-dot"></span>
        {{ modelCount }} 个模型已就绪
      </span>
    </div>
  </header>
</template>
