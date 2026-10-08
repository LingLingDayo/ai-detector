<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { ProbeStepItem } from "../types";
import ProbeModalHeader from "./probe-detail/ProbeModalHeader.vue";
import ProbePromptSection from "./probe-detail/ProbePromptSection.vue";
import ProbeAnswerSection from "./probe-detail/ProbeAnswerSection.vue";
import ProbeModalFooter from "./probe-detail/ProbeModalFooter.vue";

const props = defineProps<{
  isOpen: boolean;
  steps: ProbeStepItem[];
  initialIndex: number;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const activeIndex = ref(props.initialIndex);

watch(
  () => props.initialIndex,
  (newIdx) => {
    activeIndex.value = newIdx;
  }
);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      activeIndex.value = props.initialIndex;
    }
  }
);

const currentStep = computed<ProbeStepItem | null>(() => {
  return props.steps[activeIndex.value] ?? null;
});

function selectStep(idx: number): void {
  if (idx >= 0 && idx < props.steps.length) {
    activeIndex.value = idx;
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (!props.isOpen) return;

  if (e.key === "Escape") {
    emit("close");
  } else if (e.key === "ArrowLeft") {
    if (activeIndex.value > 0) {
      selectStep(activeIndex.value - 1);
    }
  } else if (e.key === "ArrowRight") {
    if (activeIndex.value < props.steps.length - 1) {
      selectStep(activeIndex.value + 1);
    }
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen && currentStep"
      class="probe-modal-backdrop"
      @click.self="emit('close')"
    >
      <div
        class="probe-modal-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`modal-title-${activeIndex}`"
      >
        <!-- 弹窗顶栏 -->
        <ProbeModalHeader
          :steps="steps"
          :active-index="activeIndex"
          @select-step="selectStep"
          @close="emit('close')"
        />

        <!-- 弹窗主体内容 -->
        <div class="probe-modal-body">
          <ProbePromptSection
            :prompt="currentStep.prompt"
            :expected-count="currentStep.expectedCount"
          />

          <ProbeAnswerSection :step="currentStep" />
        </div>

        <!-- 弹窗底栏 -->
        <ProbeModalFooter
          :active-index="activeIndex"
          :total-steps="steps.length"
          @select-step="selectStep"
          @close="emit('close')"
        />
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.probe-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 7, 13, 0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
  animation: fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.probe-modal-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 720px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.75), 0 0 28px rgba(99, 102, 241, 0.2);
  animation: modalScaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;

  .probe-modal-body {
    padding: 16px 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}
</style>
