<script setup lang="ts">
import { computed, ref } from "vue";
import { FolderOpen, RotateCcw } from "@lucide/vue";
import SegmentedControl from "../common/SegmentedControl.vue";
import CustomSelect from "../common/CustomSelect.vue";
import NumberInput from "../common/NumberInput.vue";
import TextInput from "../common/TextInput.vue";
import ToggleSwitch from "../common/ToggleSwitch.vue";
import { useSettingsStore } from "../../stores";
import { useToast } from "../../composables/useToast";
import { pickDownloadDirectory } from "../../services/pelicanFiles";
import type { SettingsField, SettingsValue } from "../../settings/types";

const props = defineProps<{
  field: SettingsField;
}>();

const settingsStore = useSettingsStore();
const { showToast } = useToast();
const isPickingDirectory = ref(false);

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
const isStacked = computed(
  () => props.field.type === "directory" || (props.field.type === "text" && props.field.stacked === true)
);
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
  } else if (field.type === "directory") {
    text = String(fallback).trim() || "系统默认“下载”文件夹";
  } else {
    text = field.unit ? `${fallback} ${field.unit}` : String(fallback);
  }
  return `默认值：${text}`;
});

function handleChange(value: SettingsValue): void {
  settingsStore.setValue(props.field.key, value);
  props.field.onChange?.(value, settingsStore.context);
}

async function handlePickDirectory(): Promise<void> {
  if (isDisabled.value || isPickingDirectory.value) return;
  isPickingDirectory.value = true;
  try {
    const selected = await pickDownloadDirectory(stringValue.value.trim() || undefined);
    if (selected) {
      handleChange(selected);
    }
  } catch (error) {
    showToast({
      type: "error",
      title: "选择文件夹失败",
      message: error instanceof Error ? error.message : String(error),
      duration: 4000,
    });
  } finally {
    isPickingDirectory.value = false;
  }
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
        :class="{ 'is-single-line': field.descriptionSingleLine }"
        :title="field.descriptionSingleLine ? resolvedDescription : undefined"
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

    <div
      v-else-if="field.type === 'directory'"
      class="directory-picker"
    >
      <div
        class="directory-path"
        :class="{ 'is-empty': !stringValue.trim() }"
        :title="stringValue.trim() || field.placeholder || '系统默认“下载”文件夹'"
      >
        {{ stringValue.trim() || field.placeholder || "系统默认“下载”文件夹" }}
      </div>
      <button
        type="button"
        class="directory-btn"
        :disabled="isDisabled || isPickingDirectory"
        :title="defaultValueTitle"
        @click="handlePickDirectory"
      >
        <FolderOpen :size="13" />
        <span>选择文件夹</span>
      </button>
      <button
        v-if="stringValue.trim()"
        type="button"
        class="directory-btn directory-reset-btn"
        :disabled="isDisabled || isPickingDirectory"
        title="恢复默认（系统“下载”文件夹）"
        @click="handleChange('')"
      >
        <RotateCcw :size="12" />
        <span>默认</span>
      </button>
    </div>

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
  flex: 1;
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

  &.is-single-line {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: normal;
  }
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

.directory-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.directory-path {
  flex: 1;
  min-width: 0;
  height: 32px;
  line-height: 30px;
  padding: 0 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: text;

  &.is-empty {
    color: var(--text-muted);
    font-family: inherit;
    user-select: none;
  }
}

.directory-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 32px;
  padding: 0 10px;
  flex-shrink: 0;
  background: var(--bg-surface-control);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    display: block;
    flex-shrink: 0;
  }

  &:hover:not(:disabled) {
    background: var(--bg-surface-control-hover);
    color: var(--accent-text);
    border-color: var(--border-surface-control-hover);
  }

  &:active:not(:disabled) {
    background: var(--bg-surface-control-active);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.directory-reset-btn {
    padding: 0 9px;
  }
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
