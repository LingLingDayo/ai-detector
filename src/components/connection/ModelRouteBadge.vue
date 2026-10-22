<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { AlertTriangle, CheckCircle2, HelpCircle } from "@lucide/vue";
import { getModelRoutingStatus } from "../../utils/modelRouting";

const props = defineProps<{
  requestedModel?: string;
  actualModel?: string;
}>();

const status = computed(() =>
  getModelRoutingStatus(props.requestedModel, props.actualModel)
);

const triggerRef = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const tooltipStyle = ref<Record<string, string>>({});

const statusLabel = computed(() => {
  if (status.value === "match") return "模型路由一致";
  if (status.value === "mismatch") return "检测到模型映射";
  return "未返回实际模型";
});

const statusDescription = computed(() => {
  if (status.value === "match") {
    return "请求模型与实际响应模型一致。";
  }
  if (status.value === "mismatch") {
    return "上游可能配置了模型映射，实际响应模型与请求模型不一致。";
  }
  return "上游响应中未包含 model 字段，暂时无法核对真实路由。";
});

function updatePosition(): void {
  const trigger = triggerRef.value;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const tooltipWidth = 270;
  const tooltipHeight = tooltipRef.value?.offsetHeight || 128;
  const showBelow = window.innerHeight - rect.bottom > tooltipHeight + 16;
  const left = Math.max(
    8,
    Math.min(rect.left, window.innerWidth - tooltipWidth - 8)
  );
  tooltipStyle.value = {
    left: `${left}px`,
    ...(showBelow
      ? { top: `${rect.bottom + 7}px`, bottom: "auto" }
      : { bottom: `${window.innerHeight - rect.top + 7}px`, top: "auto" }),
  };
}

function addGlobalListeners(): void {
  window.addEventListener("scroll", updatePosition, true);
  window.addEventListener("resize", updatePosition);
}

function removeGlobalListeners(): void {
  window.removeEventListener("scroll", updatePosition, true);
  window.removeEventListener("resize", updatePosition);
}

function openTooltip(): void {
  if (isOpen.value) return;
  isOpen.value = true;
  addGlobalListeners();
  nextTick(updatePosition);
}

function closeTooltip(): void {
  if (!isOpen.value) return;
  isOpen.value = false;
  removeGlobalListeners();
}

onBeforeUnmount(removeGlobalListeners);
</script>

<template>
  <span
    ref="triggerRef"
    class="route-badge"
    :class="`is-${status}`"
    tabindex="0"
    :aria-label="statusLabel"
    @mouseenter="openTooltip"
    @mouseleave="closeTooltip"
    @focus="openTooltip"
    @blur="closeTooltip"
  >
    <CheckCircle2 v-if="status === 'match'" :size="13" />
    <AlertTriangle v-else-if="status === 'mismatch'" :size="13" />
    <HelpCircle v-else :size="13" />

    <Teleport to="body">
      <Transition name="route-tooltip-fade">
        <div
          v-if="isOpen"
          ref="tooltipRef"
          class="route-tooltip"
          :style="tooltipStyle"
          role="tooltip"
        >
          <div class="route-tooltip-title" :class="`is-${status}`">
            {{ statusLabel }}
          </div>
          <div class="route-tooltip-row">
            <span>请求模型</span>
            <code>{{ requestedModel || "—" }}</code>
          </div>
          <div class="route-tooltip-row">
            <span>实际响应</span>
            <code>{{ actualModel || "上游未返回" }}</code>
          </div>
          <p class="route-tooltip-desc">{{ statusDescription }}</p>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style lang="scss" scoped>
.route-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: help;
  outline: none;
  transition: filter var(--transition-fast);

  &.is-match {
    color: #34d399;
  }

  &.is-mismatch {
    color: #fbbf24;
  }

  &.is-unknown {
    color: #94a3b8;
  }

  &:hover,
  &:focus-visible {
    filter: brightness(1.2);
  }
}
</style>

<style lang="scss">
.route-tooltip {
  position: fixed;
  z-index: 10020;
  width: 270px;
  padding: 10px 12px;
  background: rgba(9, 14, 26, 0.97);
  border: 1px solid rgba(99, 102, 241, 0.32);
  border-radius: 8px;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.62), 0 0 20px rgba(99, 102, 241, 0.12);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  pointer-events: none;

  .route-tooltip-title {
    font-size: 0.73rem;
    font-weight: 700;
    margin-bottom: 7px;

    &.is-match {
      color: #34d399;
    }

    &.is-mismatch {
      color: #fbbf24;
    }

    &.is-unknown {
      color: #cbd5e1;
    }
  }

  .route-tooltip-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 5px;
    font-size: 0.68rem;

    span {
      flex: 0 0 54px;
      color: #64748b;
    }

    code {
      flex: 1;
      color: #e2e8f0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.68rem;
      line-height: 1.4;
      word-break: break-all;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 4px;
      padding: 1px 5px;
    }
  }

  .route-tooltip-desc {
    margin-top: 8px;
    padding-top: 7px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    color: #94a3b8;
    font-size: 0.67rem;
    line-height: 1.5;
  }
}

.route-tooltip-fade-enter-active,
.route-tooltip-fade-leave-active {
  transition: opacity 0.13s ease, transform 0.13s ease;
}

.route-tooltip-fade-enter-from,
.route-tooltip-fade-leave-to {
  opacity: 0;
  transform: translateY(-3px) scale(0.98);
}
</style>
