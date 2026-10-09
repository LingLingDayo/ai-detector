<script setup lang="ts">
import logoUrl from "../assets/logo.png";
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <div class="brand-icon" title="AI Detector">
        <img :src="logoUrl" alt="AI Detector Logo" class="brand-logo-img" />
      </div>
      <div>
        <h1 class="brand-title">AI <span>Detector</span></h1>
        <p class="brand-subtitle" title="通过探针测试，检测并鉴别 API 底层实际调用的真实大模型">
          检测与鉴别 API 背后的真实模型
        </p>
      </div>
    </div>
  </header>
</template>

<style lang="scss" scoped>
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0;

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;

    .brand-icon {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      position: relative;

      .brand-logo-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 0 8px rgba(99, 102, 241, 0.4));
        transition: transform var(--transition-normal), filter var(--transition-normal);
      }

      &:hover .brand-logo-img {
        transform: scale(1.06);
        filter: drop-shadow(0 0 14px rgba(6, 182, 212, 0.65));
      }
    }

    .brand-title {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #fff;
      line-height: 1.2;

      span {
        background: var(--accent-gradient);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
    }

    .brand-subtitle {
      font-size: 0.74rem;
      color: var(--text-secondary);
      line-height: 1.2;
    }
  }
}
</style>
