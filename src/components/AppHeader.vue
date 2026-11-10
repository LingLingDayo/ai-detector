<script setup lang="ts">
import { AlertTriangle } from "@lucide/vue";
import { useAppStore } from "../stores";
import logoUrl from "../assets/logo.png";

const appStore = useAppStore();
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

    <button
      type="button"
      class="diagnostics-entry"
      title="打开诊断中心 (Ctrl+Shift+D)"
      aria-label="打开诊断中心"
      @click="appStore.openDiagnosticsModal()"
    >
      <AlertTriangle :size="14" />
      <span>诊断</span>
    </button>
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
        filter: drop-shadow(0 0 4px rgba(var(--accent-rgb), 0.4));
        transition: transform var(--transition-normal), filter var(--transition-normal);
      }

      &:hover .brand-logo-img {
        transform: scale(1.06);
        filter: drop-shadow(0 0 8px rgba(67, 38, 233, 0.65));
      }
    }

    .brand-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-strong);
      line-height: 1.2;

      span {
        background: var(--accent-gradient);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
    }

    .brand-subtitle {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.2;
    }
  }

  .diagnostics-entry {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 6px 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--bg-control);
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;

    &:hover {
      border-color: var(--border-focus);
      background: var(--bg-control-hover);
      color: var(--text-strong);
    }
  }
}
</style>
