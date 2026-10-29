<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { Component } from "vue";
import { Palette, Settings, SlidersHorizontal, X } from "@lucide/vue";

type SettingsTab = "general" | "appearance";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const tabs: { id: SettingsTab; label: string; icon: Component }[] = [
  { id: "general", label: "通用", icon: SlidersHorizontal },
  { id: "appearance", label: "外观", icon: Palette },
];

const activeTab = ref<SettingsTab>("general");

function handleDocumentKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && props.isOpen) {
    emit("close");
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleDocumentKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="settings-backdrop"
      @click.self="emit('close')"
    >
      <div
        class="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header class="settings-header">
          <div class="header-left">
            <span class="header-icon">
              <Settings :size="16" />
            </span>
            <h3 id="settings-title">设置</h3>
          </div>

          <button
            type="button"
            class="close-btn"
            aria-label="关闭设置"
            title="关闭设置 (Esc)"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </header>

        <div class="settings-body">
          <nav
            class="settings-nav"
            role="tablist"
            aria-label="设置分类"
          >
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              class="nav-item"
              :class="{ active: activeTab === tab.id }"
              role="tab"
              :aria-selected="activeTab === tab.id"
              @click="activeTab = tab.id"
            >
              <component :is="tab.icon" :size="14" />
              <span>{{ tab.label }}</span>
            </button>
          </nav>

          <section
            class="settings-content"
            role="tabpanel"
          ></section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(4, 7, 13, 0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 720px;
  height: min(72vh, 480px);
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.75), 0 0 28px rgba(99, 102, 241, 0.18);
  overflow: hidden;
  animation: modalScaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(15, 23, 42, 0.75);

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-icon {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.3);
    color: #818cf8;
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);

    svg {
      display: block;
      flex-shrink: 0;
    }

    &:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
    }
  }
}

.settings-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 160px;
  flex-shrink: 0;
  padding: 10px 8px;
  border-right: 1px solid var(--border-subtle);
  background: rgba(10, 15, 25, 0.4);

  .nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);

    svg {
      display: block;
      flex-shrink: 0;
    }

    span {
      line-height: 1;
    }

    &:hover:not(.active) {
      color: var(--text-primary);
      background: rgba(99, 102, 241, 0.08);
    }

    &.active {
      color: #fff;
      background: rgba(99, 102, 241, 0.18);
      border-color: rgba(99, 102, 241, 0.35);
    }
  }
}

.settings-content {
  flex: 1;
  min-width: 0;
  padding: 18px;
  overflow-y: auto;
}

@media (max-width: 560px) {
  .settings-dialog {
    height: min(78vh, 520px);
  }

  .settings-nav {
    width: 132px;

    .nav-item {
      padding: 0 8px;
    }
  }
}
</style>
