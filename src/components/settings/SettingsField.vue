<script setup lang="ts">
import { computed } from "vue";
import SegmentedControl from "../common/SegmentedControl.vue";
import CustomSelect from "../common/CustomSelect.vue";
import NumberInput from "../common/NumberInput.vue";
import TextInput from "../common/TextInput.vue";
import ToggleSwitch from "../common/ToggleSwitch.vue";
import { useSettingsStore } from "../../stores";
import type { SettingsField, SettingsValue } from "../../settings/types";

const props = defineProps<{
  field: SettingsField;
}>();

const settingsStore = useSettingsStore();

const rawValue = computed<SettingsValue>(
  () => settingsStore.getValue(props.field.key) ?? props.field.defaultValue
);

const stringValue = computed(() => String(rawValue.value));
const numberValue = computed(() => {
  const parsed = Number(rawValue.value);
  return Number.isFinite(parsed) ? parsed : Number(props.field.defaultValue);
});
const booleanValue = computed(() => rawValue.value === true || rawValue.value === "true");

const isDisabled = computed(() => props.field.disabled?.(settingsStore.context) ?? false);
const isStacked = computed(() => props.field.type === "text" && props.field.stacked === true);
const resolvedDescription = computed(() => {
  const desc = props.field.description;
  return typeof desc === "function" ? desc(settingsStore.context) : desc;
});

const defaultValueTitle = computed(() => {
  const field = props.field;
  const fallback = field.defaultValue;
  let text: string;
  if (field.type === "segmented" || field.type === "select") {
    text = field.options.find((option) => option.value === String(fallback))?.label ?? String(fallback);
  } else if (field.type === "toggle") {
    text = fallback ? "开启" : "关闭";
  } else if (field.type === "text") {
    text = String(fallback).trim() || "空";
  } else {
    text = field.unit ? `${fallback} ${field.unit}` : String(fallback);
  }
  return `默认值：${text}`;
});

function handleChange(value: SettingsValue): void {
  settingsStore.setValue(props.field.key, value);
  props.field.onChange?.(value, settingsStore.context);
}
</script>

<template>
  <div
    class="settings-field"
    :class="{ 'is-stacked': isStacked }"
  >
    <div class="field-meta">
      <span class="field-label">{{ field.label }}</span>
      <span
        v-if="resolvedDescription"
        class="field-desc"
      >{{ resolvedDescription }}</span>
    </div>

    <SegmentedControl
      v-if="field.type === 'segmented'"
      class="field-control"
      :model-value="stringValue"
      :options="field.options"
      :disabled="isDisabled"
      :title="defaultValueTitle"
      @change="handleChange"
    />

    <CustomSelect
      v-else-if="field.type === 'select'"
      class="field-control"
      :model-value="stringValue"
      :options="field.options"
      :placeholder="field.placeholder"
      :disabled="isDisabled"
      :title="defaultValueTitle"
      @change="handleChange"
    />

    <NumberInput
      v-else-if="field.type === 'number'"
      class="field-control field-control-narrow"
      :model-value="numberValue"
      :min="field.min"
      :max="field.max"
      :step="field.step"
      :unit="field.unit"
      :placeholder="field.placeholder"
      :disabled="isDisabled"
      :title="defaultValueTitle"
      @change="handleChange"
    />

    <TextInput
      v-else-if="field.type === 'text'"
      class="field-control"
      :class="{ 'field-control-full': isStacked }"
      :model-value="stringValue"
      :placeholder="field.placeholder"
      :max-length="field.maxLength"
      :monospace="field.monospace"
      :disabled="isDisabled"
      :title="defaultValueTitle"
      @change="handleChange"
    />

    <ToggleSwitch
      v-else-if="field.type === 'toggle'"
      class="field-toggle"
      :model-value="booleanValue"
      :label="field.label"
      :disabled="isDisabled"
      :title="defaultValueTitle"
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
  padding: 6px 0;

  &.is-stacked {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
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
  word-break: break-all;
}

.field-control {
  width: 212px;
  flex-shrink: 0;
}

.field-control-narrow {
  width: 120px;
}

.field-control-full {
  width: 100%;
}

.field-toggle {
  flex-shrink: 0;
}

@media (max-width: 560px) {
  .settings-field {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .field-control,
  .field-control-narrow {
    width: 100%;
  }

  .field-toggle {
    align-self: flex-end;
  }
}
</style>
