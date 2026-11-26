<script setup lang="ts">
import { computed, ref } from "vue";
import {
  AlertTriangle,
  FileArchive,
  FileJson,
  Lock,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "@lucide/vue";
import SegmentedControl from "../common/SegmentedControl.vue";
import DataImportUnlockCard from "./DataImportUnlockCard.vue";
import DataSelectionTree from "./DataSelectionTree.vue";
import {
  collectOverwriteTargets,
  computeImportStats,
  createDefaultScope,
  createEmptyScope,
  extractSelectedConfigs,
} from "./dataPanelHelpers";
import {
  useCandyTestStore,
  useConfigStore,
  useConnectionTestStore,
  usePelicanTestStore,
  useProbeTestStore,
  useSettingsStore,
} from "../../stores";
import { useConfirm } from "../../composables/useConfirm";
import { useToast } from "../../composables/useToast";
import {
  inspectImportFile,
  parseImportPayload,
  pickImportFile,
  type DataSelectionScope,
  type ParsedImportArchive,
} from "../../services/dataTransfer";
import { DataVaultError } from "../../utils/dataVault";
import { formatHistoryTime } from "../../utils/pelicanFormatters";

type ImportStrategy = "merge" | "overwrite";

const importStrategyOptions = [
  { value: "merge", label: "合并导入" },
  { value: "overwrite", label: "覆盖导入" },
];

const configStore = useConfigStore();
const probeStore = useProbeTestStore();
const pelicanStore = usePelicanTestStore();
const candyStore = useCandyTestStore();
const connectionStore = useConnectionTestStore();
const settingsStore = useSettingsStore();
const { confirm } = useConfirm();
const { showToast } = useToast();

const isDragOver = ref(false);
const isParsingImport = ref(false);
const isApplyingImport = ref(false);
const pendingFile = ref<{ fileName: string; bytes: Uint8Array; requiresKey: boolean } | null>(null);
const unlockError = ref("");
const parsedArchive = ref<ParsedImportArchive | null>(null);
const importSelection = ref<DataSelectionScope>(createEmptyScope());
const importStrategy = ref<ImportStrategy>("merge");

const importSelectedStats = computed(() => computeImportStats(importSelection.value));

function resetImportState(): void {
  pendingFile.value = null;
  unlockError.value = "";
  parsedArchive.value = null;
  importSelection.value = createEmptyScope();
}

async function loadImportBytes(fileName: string, bytes: Uint8Array): Promise<void> {
  unlockError.value = "";
  isParsingImport.value = true;
  try {
    const inspected = inspectImportFile(bytes, fileName);
    if (inspected.kind === "encrypted" && inspected.requiresKey) {
      pendingFile.value = { fileName, bytes, requiresKey: true };
      parsedArchive.value = null;
      return;
    }

    const parsed = await parseImportPayload(bytes);
    pendingFile.value = { fileName, bytes, requiresKey: parsed.hasUserKey };
    parsedArchive.value = parsed;
    importSelection.value = createDefaultScope(parsed.data);
  } catch (err) {
    resetImportState();
    showToast({
      type: "error",
      title: "无法解析导入文件",
      message: err instanceof Error ? err.message : String(err),
      duration: 4500,
    });
  } finally {
    isParsingImport.value = false;
  }
}

async function handlePickImportFile(): Promise<void> {
  if (isParsingImport.value) return;
  try {
    const picked = await pickImportFile();
    if (!picked) return;
    await loadImportBytes(picked.fileName, picked.bytes);
  } catch (err) {
    showToast({
      type: "error",
      title: "读取文件失败",
      message: err instanceof Error ? err.message : String(err),
      duration: 4000,
    });
  }
}

async function handleDropFile(event: DragEvent): Promise<void> {
  isDragOver.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    await loadImportBytes(file.name, new Uint8Array(buffer));
  } catch (err) {
    showToast({
      type: "error",
      title: "读取拖放文件失败",
      message: err instanceof Error ? err.message : String(err),
      duration: 4000,
    });
  }
}

async function handleUnlockEncryptedFile(rawKey: string): Promise<void> {
  if (!pendingFile.value || isParsingImport.value) return;
  const key = rawKey.trim();
  if (!key) {
    unlockError.value = "请输入加密密钥";
    return;
  }
  unlockError.value = "";
  isParsingImport.value = true;
  try {
    const parsed = await parseImportPayload(pendingFile.value.bytes, key);
    parsedArchive.value = parsed;
    importSelection.value = createDefaultScope(parsed.data);
  } catch (err) {
    if (err instanceof DataVaultError) {
      unlockError.value = err.message;
    } else {
      unlockError.value = err instanceof Error ? err.message : "解密失败";
    }
  } finally {
    isParsingImport.value = false;
  }
}

async function handleExecuteImport(): Promise<void> {
  const archive = parsedArchive.value;
  if (!archive || !importSelectedStats.value.hasAny || isApplyingImport.value) return;

  const sel = importSelection.value;
  const data = archive.data;
  const hasSelectedConfigs =
    sel.selectedConfigIds.size > 0 || sel.selectedGroupIds.size > 0;

  if (importStrategy.value === "overwrite") {
    const targets = collectOverwriteTargets(sel);
    const confirmed = await confirm({
      type: "danger",
      styleVariant: "spotlight",
      highlightTag: "覆盖现有数据",
      title: "确认覆盖导入？",
      message: `覆盖模式将清空并替换以下本地数据：${targets.join("、")}。未勾选的分类保持不变。`,
      confirmText: "确认覆盖导入",
      cancelText: "取消",
    });
    if (!confirmed) return;
  }

  isApplyingImport.value = true;
  try {
    const parts: string[] = [];
    const mode = importStrategy.value;

    if (hasSelectedConfigs) {
      const { groups, items } = extractSelectedConfigs(data, sel);
      const res = configStore.importConfigs({ groups, items }, mode);
      parts.push(
        res.skippedItems > 0
          ? `账号 +${res.addedItems}（跳过重复 ${res.skippedItems}）`
          : `账号 +${res.addedItems}`
      );
    }

    if (sel.selectedHistoryTypes.has("probe")) {
      const res = probeStore.importProbeHistory(data.probeHistory, mode);
      parts.push(`模型历史 +${res.added}`);
    }
    if (sel.selectedHistoryTypes.has("pelican")) {
      const res = pelicanStore.importPelicanHistory(data.pelicanHistory, mode);
      parts.push(`鹈鹕历史 +${res.added}`);
    }
    if (sel.selectedHistoryTypes.has("candy")) {
      const res = candyStore.importCandyHistory(data.candyHistory, mode);
      parts.push(`糖果历史 +${res.added}`);
    }
    if (sel.selectedHistoryTypes.has("connection")) {
      const res = connectionStore.importConnectionHistory(data.connectionHistory, mode);
      parts.push(`连接历史 +${res.added}`);
    }
    if (sel.includeSettings) {
      const count = settingsStore.importSettings(data.settings);
      parts.push(`设置 ${count} 项`);
    }

    showToast({
      type: "success",
      title: mode === "overwrite" ? "覆盖导入完成" : "合并导入完成",
      message: parts.join(" · "),
      duration: 4500,
    });
  } catch (err) {
    showToast({
      type: "error",
      title: "导入失败",
      message: err instanceof Error ? err.message : String(err),
      duration: 4500,
    });
  } finally {
    isApplyingImport.value = false;
  }
}
</script>

<template>
  <div class="import-view">
    <!-- 状态 1：未选择文件 -->
    <div
      v-if="!pendingFile"
      class="dropzone"
      :class="{ 'is-drag-over': isDragOver }"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="handleDropFile"
      @click="handlePickImportFile"
    >
      <div class="dropzone-icon">
        <Upload :size="22" />
      </div>
      <div class="dropzone-title">点击选择或拖拽备份文件到此处</div>
      <div class="dropzone-sub">支持 .json、.zip（含鹈鹕图片）及 .aidata 加密文件</div>
    </div>

    <template v-else>
      <div class="file-banner">
        <div class="file-banner-left">
          <template v-if="pendingFile.requiresKey && !parsedArchive">
            <Lock :size="14" class="accent-icon" />
            <span class="file-name" :title="pendingFile.fileName">{{ pendingFile.fileName }}</span>
            <span class="file-badge">已加密</span>
          </template>
          <template v-else-if="parsedArchive">
            <ShieldCheck v-if="parsedArchive.encrypted" :size="14" class="accent-icon" />
            <FileArchive v-else-if="parsedArchive.sourceFormat === 'zip'" :size="14" class="accent-icon" />
            <FileJson v-else :size="14" class="accent-icon" />
            <span class="file-name" :title="pendingFile.fileName">{{ pendingFile.fileName }}</span>
            <span v-if="parsedArchive.exportedAt" class="file-meta">
              {{ formatHistoryTime(parsedArchive.exportedAt) }}
            </span>
          </template>
        </div>
        <button type="button" class="text-link-btn" @click="resetImportState">
          <RefreshCw :size="11" />
          <span>更换文件</span>
        </button>
      </div>

      <!-- 状态 2：需要输入加密密钥 -->
      <DataImportUnlockCard
        v-if="pendingFile.requiresKey && !parsedArchive"
        :is-unlocking="isParsingImport"
        :error="unlockError"
        @unlock="handleUnlockEncryptedFile"
      />

      <!-- 状态 3：已解析，预览并勾选导入 -->
      <template v-else-if="parsedArchive">
        <div v-if="parsedArchive.warnings.length > 0" class="warning-banner">
          <AlertTriangle :size="13" />
          <span>{{ parsedArchive.warnings[0] }}（共 {{ parsedArchive.warnings.length }} 条提示）</span>
        </div>

        <DataSelectionTree
          v-model="importSelection"
          :snapshot="parsedArchive.data"
          hide-empty
        />

        <div class="panel-footer">
          <div class="action-bar">
            <SegmentedControl
              v-model="importStrategy"
              class="strategy-switch"
              :options="importStrategyOptions"
            />

            <button
              type="button"
              class="primary-action-btn"
              :class="{ 'is-danger': importStrategy === 'overwrite' }"
              :disabled="!importSelectedStats.hasAny || isApplyingImport"
              @click="handleExecuteImport"
            >
              <span v-if="isApplyingImport" class="btn-spinner"></span>
              <Upload v-else :size="14" />
              <span>{{ isApplyingImport ? "导入中..." : "导入选中数据" }}</span>
            </button>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.import-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 10px;
}

.dropzone {
  flex: 1;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  border: 1.5px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-inset);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover,
  &.is-drag-over {
    border-color: var(--accent-primary);
    background: rgba(var(--accent-rgb), 0.06);
  }
}

.dropzone-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--accent-rgb), 0.14);
  color: var(--accent-icon);
}

.dropzone-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.dropzone-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.file-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  flex-shrink: 0;
}

.file-banner-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.accent-icon {
  color: var(--accent-icon);
  flex-shrink: 0;
}

.file-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent-text);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.file-meta {
  font-size: 11.5px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.text-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--accent-text);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    text-decoration: underline;
  }
}

.warning-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--warning-bg);
  color: var(--warning-text);
  font-size: 12px;
  flex-shrink: 0;
}

.panel-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.strategy-switch {
  width: 190px;
  flex-shrink: 0;
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

  &.is-danger {
    background: var(--danger);
    color: #ffffff;
    box-shadow: none;
  }
}
</style>
