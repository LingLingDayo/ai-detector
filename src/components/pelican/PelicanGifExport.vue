<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from "vue";
import { X, Download } from "@lucide/vue";
import PelicanDisplayStage from "./PelicanDisplayStage.vue";
import type { PelicanContentType } from "./pelicanPreview";
import { recordPelicanGif } from "../../services/pelicanGif";
import { useToast } from "../../composables/useToast";
import { savePelicanFile } from "../../services/saveFile";

const props = defineProps<{
  content: string;
  contentType: PelicanContentType;
  modelName: string;
  bgTheme: "dark" | "light";
}>();
const emit = defineEmits<{ (e: "close"): void }>();
const captureRoot = ref<HTMLElement>();
const dialog = ref<HTMLElement>();
const duration = ref(5);
const running = ref(false);
const progress = ref(0);
const phase = ref<"recording" | "encoding">("recording");
let controller: AbortController | undefined;
const { showToast } = useToast();

function close() {
  controller?.abort();
  emit("close");
}

async function record() {
  const element = captureRoot.value?.querySelector<HTMLElement>(".display-container");
  if (!element || running.value) return;
  controller = new AbortController();
  running.value = true;
  progress.value = 0;
  try {
    const blob = await recordPelicanGif(element, {
      durationSeconds: Number(duration.value), signal: controller.signal,
      onProgress: value => { progress.value = value; },
      onPhase: value => { phase.value = value; },
    });
    if (controller.signal.aborted) return;
    const model = (props.modelName || "model").replace(/[^a-zA-Z0-9_-]/g, "_");
    const savedPath = await savePelicanFile(blob, `pelican-${model}-${Date.now()}.gif`);
    if (!savedPath) return;
    showToast({ type: "success", title: "GIF 已保存", message: savedPath, duration: 4000 });
    emit("close");
  } catch (error) {
    if (!controller.signal.aborted) {
      showToast({ type: "error", title: "GIF 导出失败", message: error instanceof Error ? error.message : String(error), duration: 5000 });
    }
  } finally {
    running.value = false;
  }
}

const previousFocus = document.activeElement as HTMLElement | null;
const previousOverflow = document.body.style.overflow;
onMounted(() => { document.body.style.overflow = "hidden"; dialog.value?.focus(); });
onBeforeUnmount(() => {
  controller?.abort();
  document.body.style.overflow = previousOverflow;
  previousFocus?.focus();
});
</script>

<template>
  <Teleport to="body">
    <div class="gif-backdrop" @keydown.esc.stop="close" @click.self="close">
      <section ref="dialog" class="gif-dialog" role="dialog" aria-modal="true" aria-labelledby="gif-title" tabindex="-1">
        <header class="gif-header">
          <h3 id="gif-title">导出 GIF 动图</h3>
          <button class="gif-button" aria-label="关闭录制" @click="close"><X :size="16" /></button>
        </header>
        <div ref="captureRoot" class="gif-preview">
          <PelicanDisplayStage :is-running="false" :content="content" :content-type="contentType" raw-text="" :bg-theme="bgTheme" />
        </div>
        <footer class="gif-footer">
          <label>时长
            <select v-model="duration" :disabled="running" aria-label="GIF 录制时长">
              <option :value="3">3 秒</option><option :value="5">5 秒</option><option :value="10">10 秒</option>
            </select>
          </label>
          <span class="gif-hint" role="status">{{ running ? (phase === 'recording' ? `正在录制 ${progress}% · 请保持窗口可见` : `正在生成 GIF ${progress}%`) : '循环播放 · 最长边 640px · 30 帧/秒' }}</span>
          <button class="gif-button" @click="running ? controller?.abort() : close()">{{ running ? '取消录制' : '取消' }}</button>
          <button class="gif-button gif-primary" :disabled="running" @click="record"><Download :size="14" />{{ running ? (phase === 'recording' ? '录制中…' : '生成中…') : '开始录制' }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.gif-backdrop { position: fixed; inset: 0; z-index: 10000; background: rgba(0, 0, 0, .65); display: flex; align-items: center; justify-content: center; padding: 16px; }
.gif-dialog { display: flex; flex-direction: column; gap: 12px; width: min(850px, 100%); height: min(620px, 100%); padding: 16px; border-radius: 12px; border: 1px solid var(--border-subtle); background: var(--bg-panel); color: var(--text-primary); outline: none; }
.gif-header { display: flex; justify-content: space-between; align-items: center; h3 { font-size: 15px; margin: 0; } }
.gif-preview { flex: 1; min-height: 0; :deep(.display-container) { height: 100%; } }
.gif-footer { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; label { display: flex; gap: 6px; align-items: center; } select { padding: 5px; background: var(--bg-panel); color: inherit; border: 1px solid var(--border-subtle); border-radius: 6px; } }
.gif-hint { flex: 1; color: var(--text-secondary); }
.gif-button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 6px 10px; border: 1px solid var(--border-subtle); border-radius: 6px; color: inherit; background: var(--bg-panel); cursor: pointer; &:disabled { opacity: .5; cursor: wait; } }
.gif-primary { color: var(--accent-text); border-color: var(--accent-primary); }
</style>
