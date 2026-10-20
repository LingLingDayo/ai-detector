<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { PelicanHistoryItem, ProbeHistoryItem } from "../../types";
import { History, Radar, Trash2, X } from "@lucide/vue";
import { useConfirm } from "../../composables/useConfirm";
import ProbeHistoryList from "./ProbeHistoryList.vue";
import PelicanHistoryGrid from "./PelicanHistoryGrid.vue";

export type HistoryTab = "pelican" | "probe";

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    initialTab?: HistoryTab;
    pelicanList: PelicanHistoryItem[];
    probeList?: ProbeHistoryItem[];
    probeRunning?: boolean;
    pelicanRunning?: boolean;
  }>(),
  {
    isOpen: false,
    initialTab: "probe",
    pelicanList: () => [],
    probeList: () => [],
    probeRunning: false,
    pelicanRunning: false,
  }
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "delete-pelican", id: string): void;
  (e: "clear-pelican"): void;
  (e: "apply-pelican", item: PelicanHistoryItem): void;
  (e: "delete-probe", id: string): void;
  (e: "clear-probe"): void;
  (e: "apply-probe", item: ProbeHistoryItem): void;
}>();

const { confirm } = useConfirm();

// 当前选中的 Tab 菜单，支持无缝切换与扩展
const activeTab = ref<HistoryTab>(props.initialTab);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      activeTab.value = props.initialTab || "probe";
    }
  }
);

const pelicanTotalCount = computed(() => props.pelicanList.length);
const probeTotalCount = computed(() => (props.probeList || []).length);

async function handleClearHistory(): Promise<void> {
  const isProbe = activeTab.value === "probe";
  const title = isProbe ? "确认清空模型测试历史？" : "确认清空鹈鹕测试历史？";
  const message = isProbe
    ? "清空后将永久删除所有模型探测历史记录，数据无法恢复。"
    : "清空后将永久删除所有鹈鹕测试生成的图片历史，数据无法恢复。";

  const confirmed = await confirm({
    type: "danger",
    styleVariant: "spotlight",
    title,
    message,
    confirmText: "确认清空",
    cancelText: "取消",
  });

  if (!confirmed) return;

  if (isProbe) {
    emit("clear-probe");
  } else {
    emit("clear-pelican");
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="history-modal-backdrop"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
      tabindex="-1"
    >
      <div
        class="history-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-history-title"
      >
        <!-- 弹窗顶栏：标题、Tab 菜单切换栏与操作区 -->
        <header class="modal-header">
          <div class="header-left">
            <div class="header-icon-box">
              <History :size="18" />
            </div>
            <h3 id="test-history-title">测试历史记录</h3>

            <!-- 扩展性 Tab 切换菜单：模型测试在左边，鹈鹕测试在右边 -->
            <nav class="history-tabs-nav" role="tablist" aria-label="测试类型切换">
              <button
                type="button"
                role="tab"
                class="tab-btn"
                :class="{ active: activeTab === 'probe' }"
                :aria-selected="activeTab === 'probe'"
                @click="activeTab = 'probe'"
              >
                <Radar :size="13" />
                <span>模型测试</span>
              </button>

              <button
                type="button"
                role="tab"
                class="tab-btn"
                :class="{ active: activeTab === 'pelican' }"
                :aria-selected="activeTab === 'pelican'"
                @click="activeTab = 'pelican'"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="5.5" cy="17.5" r="3.5" />
                  <circle cx="18.5" cy="17.5" r="3.5" />
                  <path d="M15 6a3 3 0 1 0-3-3" />
                  <path d="M12 17.5V14l-3-3 4-3 3 3h3" />
                </svg>
                <span>鹈鹕测试</span>
              </button>
            </nav>
          </div>

          <div class="header-actions">
            <!-- 模型测试清空按钮 -->
            <button
              v-if="activeTab === 'probe' && probeTotalCount > 0"
              type="button"
              class="clear-btn"
              title="清空模型测试历史"
              @click="handleClearHistory"
            >
              <Trash2 :size="13" />
              <span>清空记录</span>
            </button>

            <!-- 鹈鹕测试清空按钮 -->
            <button
              v-else-if="activeTab === 'pelican' && pelicanTotalCount > 0"
              type="button"
              class="clear-btn"
              title="清空鹈鹕测试历史"
              @click="handleClearHistory"
            >
              <Trash2 :size="13" />
              <span>清空记录</span>
            </button>

            <!-- 关闭弹窗按钮 -->
            <button
              type="button"
              class="close-btn"
              aria-label="关闭弹窗"
              @click="emit('close')"
            >
              <X :size="18" />
            </button>
          </div>
        </header>

        <!-- 弹窗内容主体 -->
        <main class="modal-body">
          <!-- 1. 模型测试历史视图（左侧默认 Tab） -->
          <ProbeHistoryList
            v-if="activeTab === 'probe'"
            :probe-list="probeList"
            :apply-disabled="probeRunning"
            @apply="emit('apply-probe', $event)"
            @delete="emit('delete-probe', $event)"
          />

          <!-- 2. 鹈鹕测试历史视图 -->
          <PelicanHistoryGrid
            v-else-if="activeTab === 'pelican'"
            :pelican-list="pelicanList"
            :apply-disabled="pelicanRunning"
            @apply="emit('apply-pelican', $event)"
            @delete="emit('delete-pelican', $event)"
          />
        </main>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
/* 弹窗遮罩 */
.history-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 7, 13, 0.84);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
  animation: fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 对话框主体：固定 85vh 高度，最大不超过 780px */
.history-modal-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 860px;
  height: min(85vh, 780px);
  max-height: 780px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 28px 56px rgba(0, 0, 0, 0.82), 0 0 32px rgba(99, 102, 241, 0.18);
  animation: modalScaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

/* 顶栏 */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(15, 23, 42, 0.75);
  gap: 16px;

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;

    .header-icon-box {
      width: 30px;
      height: 30px;
      border-radius: var(--radius-sm);
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: #818cf8;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    h3 {
      font-size: 0.96rem;
      font-weight: 600;
      color: #fff;
      margin: 0;
      white-space: nowrap;
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;

    .clear-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 24px;
      padding: 0 10px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: var(--radius-sm);
      color: #fca5a5;
      font-size: 0.74rem;
      line-height: 1;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.2s ease;

      svg {
        display: block;
        flex-shrink: 0;
      }

      span {
        display: inline-flex;
        align-items: center;
        line-height: 1;
        transform: translateY(-0.5px);
      }

      &:hover {
        background: rgba(239, 68, 68, 0.2);
        border-color: rgba(239, 68, 68, 0.45);
        color: #fee2e2;
      }
    }

    .close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s ease;

      svg {
        display: block;
        flex-shrink: 0;
      }

      &:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }
    }
  }
}

/* Tab 切换导航条 */
.history-tabs-nav {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(15, 23, 42, 0.85);
  padding: 3px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.08);

  .tab-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 24px;
    padding: 0 10px;
    font-size: 0.74rem;
    font-weight: 500;
    line-height: 1;
    font-family: inherit;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.18s ease;
    white-space: nowrap;

    svg {
      display: block;
      flex-shrink: 0;
    }

    span {
      display: inline-flex;
      align-items: center;
      line-height: 1;
      transform: translateY(-0.5px);
    }

    &:hover {
      color: #e2e8f0;
      background: rgba(255, 255, 255, 0.05);
    }

    &.active {
      color: #fff;
      background: rgba(99, 102, 241, 0.3);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    }
  }
}

/* 内容主体：撑满弹窗剩余高度，溢出独立滚动 */
.modal-body {
  flex: 1;
  min-height: 0;
  padding: 16px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
</style>
