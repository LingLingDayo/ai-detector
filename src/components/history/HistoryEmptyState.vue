<script setup lang="ts">
import { Globe, Image, MessagesSquare } from "@lucide/vue";

defineProps<{
  type: "probe" | "pelican" | "connection";
}>();
</script>

<template>
  <div class="empty-state">
    <div
      class="empty-icon-wrap"
      :class="{
        'probe-icon-wrap': type === 'probe',
        'connection-icon-wrap': type === 'connection',
      }"
    >
      <Globe v-if="type === 'probe'" :size="40" :stroke-width="1.6" />
      <MessagesSquare
        v-else-if="type === 'connection'"
        :size="40"
        :stroke-width="1.6"
      />
      <Image v-else :size="40" :stroke-width="1.6" />
    </div>

    <p class="empty-title">
      {{
        type === "probe"
          ? "暂无模型测试历史记录"
          : type === "pelican"
          ? "暂无鹈鹕测试历史记录"
          : "暂无连接测试历史记录"
      }}
    </p>
    <p class="empty-desc">
      {{
        type === "probe"
          ? "在“模型测试”模式中，完成探测并生成模型归因诊断后，记录将自动保存在这里。"
          : type === "pelican"
          ? "在“鹈鹕测试”模式中，AI 模型成功生成的图片将会自动保存在这里。"
          : "在“连接测试”模式中发送消息后，本次会话的模型路由、输出速度与缓存率汇总将实时更新并保存在这里。"
      }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 20px;
  gap: 10px;

  .empty-icon-wrap {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.08);
    border: 1px dashed rgba(99, 102, 241, 0.25);
    color: #818cf8;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 6px;

    &.probe-icon-wrap {
      background: rgba(56, 189, 248, 0.08);
      border-color: rgba(56, 189, 248, 0.25);
      color: #38bdf8;
    }

    &.connection-icon-wrap {
      background: rgba(16, 185, 129, 0.08);
      border-color: rgba(16, 185, 129, 0.25);
      color: #34d399;
    }
  }

  .empty-title {
    font-size: 0.92rem;
    font-weight: 600;
    color: #e2e8f0;
    margin: 0;
  }

  .empty-desc {
    font-size: 0.78rem;
    color: var(--text-secondary);
    max-width: 360px;
    line-height: 1.5;
    margin: 0;
  }
}
</style>
