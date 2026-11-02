<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { Settings, X } from "@lucide/vue";
import { settingsPages } from "../../settings";
import { useSettingsStore } from "../../stores";
import SettingsField from "./SettingsField.vue";
import type { SettingsSection } from "../../settings/types";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const settingsStore = useSettingsStore();

const activeTab = ref(settingsPages[0]?.id ?? "");
const activePage = computed(
  () => settingsPages.find((page) => page.id === activeTab.value) ?? settingsPages[0]
);

function getVisibleFields(section: SettingsSection) {
  return section.fields.filter((field) =>
    field.visible ? field.visible(settingsStore.context) : true
  );
}

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
              v-for="page in settingsPages"
              :key="page.id"
              type="button"
              class="nav-item"
              :class="{ active: activeTab === page.id }"
              role="tab"
              :aria-selected="activeTab === page.id"
              @click="activeTab = page.id"
            >
              <component :is="page.icon" :size="14" />
              <span>{{ page.label }}</span>
            </button>
          </nav>

          <section
            class="settings-content"
            role="tabpanel"
          >
            <div
              v-for="section in activePage.sections"
              :key="section.id"
              class="settings-section"
            >
              <header
                v-if="section.title || section.description"
                class="section-head"
              >
                <h4 v-if="section.title">{{ section.title }}</h4>
                <p v-if="section.description">{{ section.description }}</p>
              </header>

              <div class="settings-fields">
                <SettingsField
                  v-for="field in getVisibleFields(section)"
                  :key="field.key"
                  :field="field"
                />
              </div>
            </div>
          </section>
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
  background: var(--backdrop-color);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 660px;
  max-height: 88vh;
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-modal);
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
  background: var(--bg-elevated);

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
    color: var(--accent-icon);
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-strong);
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
      color: var(--text-strong);
      background: var(--overlay-medium);
    }
  }
}

.settings-body {
  display: flex;
  flex: 1;
  min-height: 280px;
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 160px;
  flex-shrink: 0;
  padding: 10px 8px;
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-inset);

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

    &:hover:not(.active) {
      color: var(--text-primary);
      background: rgba(99, 102, 241, 0.08);
    }

    &.active {
      color: var(--text-segment-active);
      background: var(--bg-segment-active);
      border-color: var(--border-segment-active);
      box-shadow: var(--shadow-segment-active);
      font-weight: 600;
    }
  }
}

.settings-content {
  flex: 1;
  min-width: 0;
  padding: 16px 18px;
  overflow-y: auto;
}

.settings-section + .settings-section {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.section-head {
  margin-bottom: 10px;

  h4 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  p {
    margin-top: 3px;
    font-size: 12px;
    color: var(--text-muted);
  }
}

.settings-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (max-width: 560px) {
  .settings-nav {
    width: 132px;

    .nav-item {
      padding: 0 8px;
    }
  }
}
</style>
