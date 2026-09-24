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
        <p class="brand-subtitle" title="基于长整数生成指纹的主动式 AI 模型归因检测">
          AI 模型主动指纹归因探测系统
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
