<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { getReasoningOptionsForModel, resolveValidReasoningEffort } from "../../constants";
import ModelCombobox from "../ModelCombobox.vue";
import { CustomSelect, type SelectOption } from "../common";

const props = defineProps<{
  modelName: string;
  apiFormat: string;
  reasoningEffort: string;
  baseUrl: string;
  apiKey: string;
  disabled: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelName", value: string): void;
  (e: "update:apiFormat", value: string): void;
  (e: "update:reasoningEffort", value: string): void;
}>();

const comboboxRef = ref<InstanceType<typeof ModelCombobox> | null>(null);

// 模型变更后自动将思考强度限定或修正到合法档位
watch(
  () => props.modelName,
  (newModel) => {
    const validEffort = resolveValidReasoningEffort(newModel, props.reasoningEffort);
    if (validEffort !== props.reasoningEffort) {
      emit("update:reasoningEffort", validEffort);
    }
  }
);

const reasoningOptions = computed<SelectOption[]>(() => {
  return getReasoningOptionsForModel(props.modelName).map((opt) => ({
    value: opt.value,
    label: opt.value,
    description: opt.isDefault ? `${opt.description} (默认)` : opt.description,
  }));
});

function triggerAutoFetch(immediate = true): void {
  comboboxRef.value?.triggerAutoFetch(immediate);
}

function resetModelList(): void {
  comboboxRef.value?.resetModelList();
}

defineExpose({
  triggerAutoFetch,
  resetModelList,
});
</script>

<template>
  <div class="form-row">
    <div class="form-group flex-1 model-select-group">
      <label for="model-name" title="指定要测试的模型 ID，支持手动输入或从下方下拉获取列表中选择">
        测试模型
      </label>
      <ModelCombobox
        ref="comboboxRef"
        :model-value="modelName"
        :api-format="apiFormat"
        :reasoning-effort="reasoningEffort"
        :base-url="baseUrl"
        :api-key="apiKey"
        :disabled="disabled"
        :required="true"
        @update:model-value="emit('update:modelName', $event)"
        @update:api-format="emit('update:apiFormat', $event)"
        @update:reasoning-effort="emit('update:reasoningEffort', $event)"
      />
    </div>

    <div class="form-group reasoning-select-group">
      <label for="reasoning-effort" title="配置模型的深度思考与推理强度">
        思考强度
      </label>
      <CustomSelect
        id="reasoning-effort"
        :model-value="reasoningEffort"
        :options="reasoningOptions"
        :disabled="disabled"
        @update:model-value="emit('update:reasoningEffort', $event)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.model-select-group {
  min-width: 0;
}

.reasoning-select-group {
  flex: 0 0 210px;
  width: 210px;

  @media (max-width: 600px) {
    flex: 1 1 auto;
    width: 100%;
  }
}
</style>
