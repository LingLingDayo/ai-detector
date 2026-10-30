<script setup lang="ts">
import { computed } from "vue";
import SegmentedControl from "../common/SegmentedControl.vue";
import { useSettingsStore } from "../../stores";
import type { SettingsField } from "../../settings/types";

const props = defineProps<{
  field: SettingsField;
}>();

const settingsStore = useSettingsStore();

const currentValue = computed(() =>
  String(settingsStore.getValue(props.field.key) ?? props.field.defaultValue)
);

const isDisabled = computed(() => props.field.disabled?.(settingsStore.context) ?? false);

function handleChange(value: string): void {
  settingsStore.setValue(props.field.key, value);
  props.field.onChange?.(value, settingsStore.context);
}
</script>

<template>
  <div class="settings-field">
    <div class="field-meta">
      <span class="field-label">{{ field.label }}</span>
      <span
        v-if="field.description"
        class="field-desc"
      >{{ field.description }}</span>
    </div>

    <SegmentedControl
      v-if="field.type === 'segmented'"
      class="field-control"
      :model-value="currentValue"
      :options="field.options"
      :disabled="isDisabled"
      @change="handleChange"
    />
  </div>
</template>

<style lang="scss" scoped>
.settings-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-row);
}

.field-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.field-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.field-control {
  width: 188px;
  flex-shrink: 0;
}

@media (max-width: 560px) {
  .settings-field {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .field-control {
    width: 100%;
  }
}
</style>
