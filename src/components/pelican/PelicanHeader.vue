<script setup lang="ts">
// 纯展示型头部组件
</script>

<template>
  <div class="pelican-header">
    <div class="header-left">
      <div class="title-row">
        <div class="pelican-icon-box">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <!-- 自行车与飞鸟抽象几何图标 -->
            <circle cx="5.5" cy="17.5" r="3.5" />
            <circle cx="18.5" cy="17.5" r="3.5" />
            <path d="M15 6a3 3 0 1 0-3-3" />
            <path d="M12 17.5V14l-3-3 4-3 3 3h3" />
          </svg>
        </div>
        <h2>鹈鹕测试</h2>
        <span class="pelican-badge">模型降智直观测试</span>
      </div>
      <p class="subtitle">
        让 AI 绘制“鹈鹕骑自行车”SVG 图像。本测试不自动判定结果，请根据下方矢量图生成质量自行评估模型状态。
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.pelican-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 2px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;

    .pelican-icon-box {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: #818cf8;
    }

    h2 {
      font-size: 0.98rem;
      font-weight: 600;
      color: #fff;
    }

    .pelican-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 7px;
      font-size: 0.7rem;
      border-radius: 9999px;
      background: rgba(99, 102, 241, 0.12);
      border: 1px solid rgba(99, 102, 241, 0.25);
      color: #a5b4fc;
      line-height: 1.2;
    }
  }

  .subtitle {
    font-size: 0.76rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }
}
</style>
