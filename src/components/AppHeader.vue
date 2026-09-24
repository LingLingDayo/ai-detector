<script setup lang="ts">
import logoUrl from "../assets/logo.png";
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
  </header>
</template>
