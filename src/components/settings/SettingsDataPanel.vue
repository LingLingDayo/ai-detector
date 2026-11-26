<script setup lang="ts">
import { ref } from "vue";
import SegmentedControl from "../common/SegmentedControl.vue";
import DataExportView from "./DataExportView.vue";
import DataImportView from "./DataImportView.vue";

type PanelMode = "export" | "import";

const activeMode = ref<PanelMode>("export");

const modeOptions = [
  { value: "export", label: "导出数据" },
  { value: "import", label: "导入数据" },
];
</script>

<template>
  <div class="data-panel">
    <div class="panel-top">
      <SegmentedControl
        v-model="activeMode"
        class="mode-switch"
        :options="modeOptions"
      />
    </div>

    <KeepAlive>
      <DataExportView v-if="activeMode === 'export'" />
      <DataImportView v-else />
    </KeepAlive>
  </div>
</template>

<style lang="scss" scoped>
.data-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 10px;
}

.panel-top {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.mode-switch {
  width: 196px;
  flex-shrink: 0;
}
</style>
