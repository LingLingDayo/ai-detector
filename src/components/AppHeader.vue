<script setup lang="ts">
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
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
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
