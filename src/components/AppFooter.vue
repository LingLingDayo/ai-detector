<script setup lang="ts">
// Stateless footer component
</script>

<template>
  <footer class="app-footer">
    <span title="仅匹配候选库内已收录模型，未收录模型仍会被归到最相似的现有候选。测试结果仅供技术参考">
      AI Detector · 纯本地运行 · 凭据不离开本机
    </span>
  </footer>
</template>

<style lang="scss" scoped>
.app-footer {
  text-align: center;
  font-size: 0.72rem;
  color: var(--text-muted);
  padding: 8px 0 4px;
}
</style>
