<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, Download, FileArchive, FileJson, Lock } from "@lucide/vue";
import ToggleSwitch from "../common/ToggleSwitch.vue";
import DataSelectionTree from "./DataSelectionTree.vue";
import DataVaultKeyInput from "./DataVaultKeyInput.vue";
import { computeExportStats, createDefaultScope } from "./dataPanelHelpers";
import {
  useCandyTestStore,
  useConfigStore,
  useConnectionTestStore,
  usePelicanTestStore,
  useProbeTestStore,
  useSettingsStore,
} from "../../stores";
import { useToast } from "../../composables/useToast";
import {
  buildExportPayload,
  saveExportFile,
  type DataSelectionScope,
  type DataSnapshot,
} from "../../services/dataTransfer";
import { loadExportVaultPrefs, saveExportVaultPrefs } from "../../utils/exportVaultPrefs";

const configStore = useConfigStore();
const probeStore = useProbeTestStore();
const pelicanStore = usePelicanTestStore();
const candyStore = useCandyTestStore();
const connectionStore = useConnectionTestStore();
const settingsStore = useSettingsStore();
const { showToast } = useToast();

const exportSnapshot = computed<DataSnapshot>(() => ({
  configGroups: configStore.configGroups,
  configList: configStore.configList,
  probeHistory: probeStore.probeHistoryList,
  pelicanHistory: pelicanStore.pelicanHistoryList,
  candyHistory: candyStore.candyHistoryList,
  connectionHistory: connectionStore.connectionHistoryList,
  settings: { ...settingsStore.values },
}));

const initialVaultPrefs = loadExportVaultPrefs();
const exportSelection = ref<DataSelectionScope>(createDefaultScope(exportSnapshot.value));
const encryptExport = ref(initialVaultPrefs.encryptExport);
const rememberExportKey = ref(initialVaultPrefs.rememberKey);
const exportUserKey = ref(initialVaultPrefs.rememberKey ? initialVaultPrefs.savedKey : "");
const isExporting = ref(false);

watch([encryptExport, rememberExportKey, exportUserKey], ([encrypt, remember, key]) => {
  saveExportVaultPrefs({
    encryptExport: encrypt,
    rememberKey: remember,
    savedKey: remember ? key : "",
  });
});

const exportSelectedStats = computed(() =>
  computeExportStats(exportSelection.value, exportSnapshot.value, encryptExport.value)
);

async function handleExport(): Promise<void> {
  if (!exportSelectedStats.value.hasAny || isExporting.value) return;
  isExporting.value = true;
  try {
    const pkg = await buildExportPayload(exportSnapshot.value, exportSelection.value, {
      encrypt: encryptExport.value,
      userKey: exportUserKey.value,
    });
    const res = await saveExportFile(pkg);
    if (res.cancelled) return;

    showToast({
      type: "success",
      title: "数据导出成功",
      message: res.savedPath ? `已保存至 ${res.savedPath}` : `已生成 ${pkg.fileName}`,
      duration: 4200,
    });
  } catch (err) {
    showToast({
      type: "error",
      title: "数据导出失败",
      message: err instanceof Error ? err.message : String(err),
      duration: 4500,
    });
  } finally {
    isExporting.value = false;
  }
}
</script>

<template>
  <div class="export-view">
    <DataSelectionTree
      v-model="exportSelection"
      :snapshot="exportSnapshot"
    />

    <div class="panel-footer">
      <div class="encrypt-box">
        <div class="encrypt-row">
          <div class="encrypt-label-group">
            <Lock :size="14" class="encrypt-icon" />
            <div class="encrypt-text">
              <span class="encrypt-title">加密导出</span>
              <span class="encrypt-desc">生成仅本软件可解密的 .aidata 文件</span>
            </div>
          </div>
          <ToggleSwitch v-model="encryptExport" label="加密导出" />
        </div>

        <div v-if="encryptExport" class="key-row">
          <DataVaultKeyInput
            v-model="exportUserKey"
            placeholder="加密密钥（可选，留空仅用软件内置密钥加密）"
            autocomplete="new-password"
            allow-generate
            allow-copy
          />

          <button
            type="button"
            class="remember-key-btn"
            :class="{ 'is-checked': rememberExportKey }"
            role="checkbox"
            :aria-checked="rememberExportKey"
            title="将导出密钥保存在本机浏览器存储中，不会随应用设置导出"
            @click="rememberExportKey = !rememberExportKey"
          >
            <span class="remember-checkbox">
              <Check v-if="rememberExportKey" :size="10" :stroke-width="3" />
            </span>
            <span class="remember-label">记住密钥</span>
          </button>
        </div>
      </div>

      <div class="action-bar">
        <div class="summary-meta">
          <span class="format-pill">
            <Lock v-if="encryptExport" :size="11" />
            <FileArchive v-else-if="exportSelectedStats.hasPelican" :size="11" />
            <FileJson v-else :size="11" />
            <span>{{ exportSelectedStats.outputExt }}</span>
          </span>
          <span class="summary-text">
            账号 {{ exportSelectedStats.configCount }} · 历史 {{ exportSelectedStats.historyCount }} 条
            <template v-if="exportSelectedStats.hasSettings"> · 含设置</template>
          </span>
        </div>

        <button
          type="button"
          class="primary-action-btn"
          :disabled="!exportSelectedStats.hasAny || isExporting"
          @click="handleExport"
        >
          <span v-if="isExporting" class="btn-spinner"></span>
          <Download v-else :size="14" />
          <span>{{ isExporting ? "导出中..." : "导出选中数据" }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.export-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 10px;
}

.panel-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.encrypt-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}

.encrypt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.encrypt-label-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.encrypt-icon {
  color: var(--accent-icon);
  flex-shrink: 0;
}

.encrypt-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.encrypt-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.encrypt-desc {
  font-size: 11.5px;
  color: var(--text-muted);
}

.key-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.remember-key-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 2px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
  transition: color var(--transition-fast);

  .remember-label {
    line-height: 1;
  }

  &:hover {
    color: var(--text-primary);

    .remember-checkbox {
      border-color: var(--accent-primary);
    }
  }

  &.is-checked {
    color: var(--text-primary);

    .remember-checkbox {
      background: var(--accent-primary);
      border-color: var(--accent-primary);
    }
  }
}

.remember-checkbox {
  width: 15px;
  height: 15px;
  padding: 0;
  line-height: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 4px;
  border: 1.5px solid var(--border-subtle);
  background: var(--bg-input);
  color: var(--accent-contrast);
  transition: all var(--transition-fast);

  :deep(svg) {
    display: block;
    flex-shrink: 0;
  }
}

.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.format-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(var(--accent-rgb), 0.14);
  border: 1px solid rgba(var(--accent-rgb), 0.3);
  color: var(--accent-text);
  font-size: 11px;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  flex-shrink: 0;
}

.summary-text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.primary-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent-gradient);
  color: var(--accent-contrast);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--accent-btn-shadow);
  transition: all var(--transition-fast);
  flex-shrink: 0;

  &:hover:not(:disabled) {
    opacity: 0.94;
    box-shadow: var(--accent-btn-shadow-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
}
</style>
