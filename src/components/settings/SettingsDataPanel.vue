<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FileJson,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlock,
  Upload,
} from "@lucide/vue";
import SegmentedControl from "../common/SegmentedControl.vue";
import ToggleSwitch from "../common/ToggleSwitch.vue";
import DataSelectionTree from "./DataSelectionTree.vue";
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
import { useClipboard } from "../../composables/useClipboard";
import {
  buildExportPayload,
  inspectImportFile,
  parseImportPayload,
  pickImportFile,
  saveExportFile,
  type DataSelectionScope,
  type DataSnapshot,
  type HistoryCategoryKey,
  type ParsedImportArchive,
} from "../../services/dataTransfer";
import { DataVaultError, generateRandomVaultKey } from "../../utils/dataVault";
import { loadExportVaultPrefs, saveExportVaultPrefs } from "../../utils/exportVaultPrefs";
import { formatHistoryTime } from "../../utils/pelicanFormatters";

type PanelMode = "export" | "import";
type ImportStrategy = "merge" | "overwrite";

const configStore = useConfigStore();
const probeStore = useProbeTestStore();
const pelicanStore = usePelicanTestStore();
const candyStore = useCandyTestStore();
const connectionStore = useConnectionTestStore();
const settingsStore = useSettingsStore();
const { confirm } = useConfirm();
const { showToast } = useToast();
const { copy } = useClipboard();

const activeMode = ref<PanelMode>("export");

const modeOptions = [
  { value: "export", label: "导出数据" },
  { value: "import", label: "导入数据" },
];

const importStrategyOptions = [
  { value: "merge", label: "合并导入" },
  { value: "overwrite", label: "覆盖导入" },
];

function createDefaultScope(snapshot: DataSnapshot): DataSelectionScope {
  const selectedGroupIds = new Set(snapshot.configGroups.map((g) => g.id));
  const selectedConfigIds = new Set(snapshot.configList.map((c) => c.id));
  const selectedHistoryTypes = new Set<HistoryCategoryKey>();
  if (snapshot.probeHistory.length > 0) selectedHistoryTypes.add("probe");
  if (snapshot.pelicanHistory.length > 0) selectedHistoryTypes.add("pelican");
  if (snapshot.candyHistory.length > 0) selectedHistoryTypes.add("candy");
  if (snapshot.connectionHistory.length > 0) selectedHistoryTypes.add("connection");

  return {
    selectedGroupIds,
    selectedConfigIds,
    selectedHistoryTypes,
    includeSettings: Object.keys(snapshot.settings).length > 0,
  };
}

// ==================== 导出状态 ====================
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
const isExportKeyVisible = ref(false);
const isExporting = ref(false);
const copiedKey = ref(false);

watch([encryptExport, rememberExportKey, exportUserKey], ([encrypt, remember, key]) => {
  saveExportVaultPrefs({
    encryptExport: encrypt,
    rememberKey: remember,
    savedKey: remember ? key : "",
  });
});

const exportSelectedStats = computed(() => {
  const s = exportSelection.value;
  const snap = exportSnapshot.value;
  const hasPelican =
    s.selectedHistoryTypes.has("pelican") && snap.pelicanHistory.length > 0;
  const historyCount =
    (s.selectedHistoryTypes.has("probe") ? snap.probeHistory.length : 0) +
    (s.selectedHistoryTypes.has("pelican") ? snap.pelicanHistory.length : 0) +
    (s.selectedHistoryTypes.has("candy") ? snap.candyHistory.length : 0) +
    (s.selectedHistoryTypes.has("connection") ? snap.connectionHistory.length : 0);
  const totalSelected =
    s.selectedConfigIds.size +
    s.selectedGroupIds.size +
    s.selectedHistoryTypes.size +
    (s.includeSettings ? 1 : 0);

  const outputExt = encryptExport.value
    ? ".aidata"
    : hasPelican
    ? ".zip"
    : ".json";

  return {
    configCount: s.selectedConfigIds.size,
    historyCount,
    hasSettings: s.includeSettings,
    hasAny: totalSelected > 0,
    hasPelican,
    outputExt,
  };
});

function handleGenerateKey(): void {
  exportUserKey.value = generateRandomVaultKey(20);
  isExportKeyVisible.value = true;
}

async function handleCopyExportKey(): Promise<void> {
  const key = exportUserKey.value.trim();
  if (!key) return;
  const ok = await copy(key);
  if (ok) {
    copiedKey.value = true;
    setTimeout(() => {
      copiedKey.value = false;
    }, 1800);
  }
}

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

// ==================== 导入状态 ====================
const isDragOver = ref(false);
const isParsingImport = ref(false);
const isApplyingImport = ref(false);
const pendingFile = ref<{ fileName: string; bytes: Uint8Array; requiresKey: boolean } | null>(null);
const unlockKeyInput = ref("");
const isUnlockKeyVisible = ref(false);
const unlockError = ref("");
const parsedArchive = ref<ParsedImportArchive | null>(null);
const importSelection = ref<DataSelectionScope>({
  selectedGroupIds: new Set(),
  selectedConfigIds: new Set(),
  selectedHistoryTypes: new Set(),
  includeSettings: false,
});
const importStrategy = ref<ImportStrategy>("merge");

const importSelectedStats = computed(() => {
  const s = importSelection.value;
  const totalSelected =
    s.selectedConfigIds.size +
    s.selectedGroupIds.size +
    s.selectedHistoryTypes.size +
    (s.includeSettings ? 1 : 0);
  return {
    hasAny: totalSelected > 0,
    configCount: s.selectedConfigIds.size,
    historyTypesCount: s.selectedHistoryTypes.size,
    hasSettings: s.includeSettings,
  };
});

function resetImportState(): void {
  pendingFile.value = null;
  unlockKeyInput.value = "";
  unlockError.value = "";
  parsedArchive.value = null;
  importSelection.value = {
    selectedGroupIds: new Set(),
    selectedConfigIds: new Set(),
    selectedHistoryTypes: new Set(),
    includeSettings: false,
  };
}

async function loadImportBytes(fileName: string, bytes: Uint8Array): Promise<void> {
  unlockError.value = "";
  isParsingImport.value = true;
  try {
    const inspected = inspectImportFile(bytes, fileName);
    if (inspected.kind === "encrypted" && inspected.requiresKey) {
      pendingFile.value = { fileName, bytes, requiresKey: true };
      parsedArchive.value = null;
      unlockKeyInput.value = "";
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

async function handleUnlockEncryptedFile(): Promise<void> {
  if (!pendingFile.value || isParsingImport.value) return;
  const key = unlockKeyInput.value.trim();
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
    const targets: string[] = [];
    if (hasSelectedConfigs) targets.push("账号配置与分组");
    if (sel.selectedHistoryTypes.has("probe")) targets.push("模型测试历史");
    if (sel.selectedHistoryTypes.has("pelican")) targets.push("鹈鹕测试历史");
    if (sel.selectedHistoryTypes.has("candy")) targets.push("糖果测试历史");
    if (sel.selectedHistoryTypes.has("connection")) targets.push("连接测试历史");
    if (sel.includeSettings) targets.push("应用设置");

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
      const items = data.configList.filter((item) => sel.selectedConfigIds.has(item.id));
      const groupIds = new Set(sel.selectedGroupIds);
      for (const item of items) {
        if (item.groupId) groupIds.add(item.groupId);
      }
      const groups = data.configGroups.filter((grp) => groupIds.has(grp.id));
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
  <div class="data-panel">
    <div class="panel-top">
      <SegmentedControl
        v-model="activeMode"
        class="mode-switch"
        :options="modeOptions"
      />
    </div>

    <!-- ==================== 导出视图 ==================== -->
    <template v-if="activeMode === 'export'">
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
            <div class="key-input-wrap">
              <input
                v-model="exportUserKey"
                :type="isExportKeyVisible ? 'text' : 'password'"
                class="key-input"
                placeholder="加密密钥（可选，留空仅用软件内置密钥加密）"
                autocomplete="new-password"
                spellcheck="false"
              />
              <div class="key-input-actions">
                <button
                  type="button"
                  class="icon-action-btn"
                  :title="isExportKeyVisible ? '隐藏密钥' : '显示密钥'"
                  @click="isExportKeyVisible = !isExportKeyVisible"
                >
                  <EyeOff v-if="isExportKeyVisible" :size="13" />
                  <Eye v-else :size="13" />
                </button>
                <button
                  type="button"
                  class="icon-action-btn"
                  title="随机生成高强度密钥"
                  @click="handleGenerateKey"
                >
                  <KeyRound :size="13" />
                </button>
                <button
                  type="button"
                  class="icon-action-btn"
                  :disabled="!exportUserKey.trim()"
                  title="复制密钥"
                  @click="handleCopyExportKey"
                >
                  <Check v-if="copiedKey" :size="13" class="icon-success" />
                  <Copy v-else :size="13" />
                </button>
              </div>
            </div>

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
                <Check v-if="rememberExportKey" :size="11" :stroke-width="3" />
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
    </template>

    <!-- ==================== 导入视图 ==================== -->
    <template v-else>
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

      <!-- 状态 2：需要输入加密密钥 -->
      <div
        v-else-if="pendingFile.requiresKey && !parsedArchive"
        class="unlock-card"
      >
        <div class="file-banner">
          <div class="file-banner-left">
            <Lock :size="14" class="accent-icon" />
            <span class="file-name">{{ pendingFile.fileName }}</span>
            <span class="file-badge">已加密</span>
          </div>
          <button type="button" class="text-link-btn" @click="resetImportState">
            更换文件
          </button>
        </div>

        <div class="unlock-body">
          <div class="unlock-icon">
            <Unlock :size="20" />
          </div>
          <div class="unlock-title">请输入加密密钥以解锁备份</div>
          <div class="unlock-desc">此文件设置了自定义密钥，解密后可预览并勾选要导入的数据</div>

          <div class="unlock-form">
            <div class="key-input-wrap">
              <input
                v-model="unlockKeyInput"
                :type="isUnlockKeyVisible ? 'text' : 'password'"
                class="key-input"
                placeholder="输入导出时设置的密钥"
                autocomplete="off"
                spellcheck="false"
                @keydown.enter="handleUnlockEncryptedFile"
              />
              <div class="key-input-actions">
                <button
                  type="button"
                  class="icon-action-btn"
                  :title="isUnlockKeyVisible ? '隐藏密钥' : '显示密钥'"
                  @click="isUnlockKeyVisible = !isUnlockKeyVisible"
                >
                  <EyeOff v-if="isUnlockKeyVisible" :size="13" />
                  <Eye v-else :size="13" />
                </button>
              </div>
            </div>

            <button
              type="button"
              class="primary-action-btn unlock-btn"
              :disabled="isParsingImport"
              @click="handleUnlockEncryptedFile"
            >
              <span v-if="isParsingImport" class="btn-spinner"></span>
              <span>{{ isParsingImport ? "解密中..." : "解密" }}</span>
            </button>
          </div>

          <div v-if="unlockError" class="unlock-error">
            <AlertTriangle :size="13" />
            <span>{{ unlockError }}</span>
          </div>
        </div>
      </div>

      <!-- 状态 3：已解析，预览并勾选导入 -->
      <template v-else-if="parsedArchive">
        <div class="file-banner">
          <div class="file-banner-left">
            <ShieldCheck v-if="parsedArchive.encrypted" :size="14" class="accent-icon" />
            <FileArchive v-else-if="parsedArchive.sourceFormat === 'zip'" :size="14" class="accent-icon" />
            <FileJson v-else :size="14" class="accent-icon" />
            <span class="file-name" :title="pendingFile.fileName">{{ pendingFile.fileName }}</span>
            <span v-if="parsedArchive.exportedAt" class="file-meta">
              {{ formatHistoryTime(parsedArchive.exportedAt) }}
            </span>
          </div>
          <button type="button" class="text-link-btn" @click="resetImportState">
            <RefreshCw :size="11" />
            <span>更换文件</span>
          </button>
        </div>

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
  width: 16px;
  height: 16px;
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

.key-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.key-input {
  width: 100%;
  height: 30px;
  padding: 0 78px 0 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);

  &:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--border-glow);
  }

  &::placeholder {
    color: var(--text-placeholder);
    font-family: inherit;
  }
}

.key-input-actions {
  position: absolute;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 2px;
}

.icon-action-btn {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover:not(:disabled) {
    background: var(--overlay-medium);
    color: var(--text-primary);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .icon-success {
    color: var(--success-text);
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

.unlock-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.unlock-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-inset);
}

.unlock-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent-icon);
}

.unlock-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.unlock-desc {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

.unlock-form {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 340px;
  margin-top: 6px;
}

.unlock-btn {
  height: 30px;
  padding: 0 14px;
}

.unlock-error {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--danger-text);
}
</style>
