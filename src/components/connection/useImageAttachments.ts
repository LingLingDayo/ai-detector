import { ref } from "vue";
import type { ConnectionImageAttachment } from "../../types";

const MAX_IMAGES = 4;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const COMPRESS_THRESHOLD = 1_500_000;

function createImageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("解析图片失败"));
    image.src = dataUrl;
  });
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function normalizeImage(
  file: File
): Promise<{ dataUrl: string; mimeType: string }> {
  const original = await readAsDataUrl(file);
  if (file.type === "image/gif") {
    return { dataUrl: original, mimeType: file.type };
  }

  const image = await loadImageElement(original);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
  if (scale >= 1 && original.length <= COMPRESS_THRESHOLD) {
    return { dataUrl: original, mimeType: file.type };
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    return { dataUrl: original, mimeType: file.type };
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const compressed = canvas.toDataURL("image/jpeg", 0.86);
  if (compressed.length >= original.length) {
    return { dataUrl: original, mimeType: file.type };
  }
  return { dataUrl: compressed, mimeType: "image/jpeg" };
}

export function useImageAttachments() {
  const images = ref<ConnectionImageAttachment[]>([]);
  const isProcessing = ref(false);
  const error = ref<string | null>(null);

  async function addFiles(files: FileList | File[]): Promise<void> {
    const list = Array.from(files);
    if (list.length === 0) return;
    error.value = null;

    const available = MAX_IMAGES - images.value.length;
    if (available <= 0) {
      error.value = `每条消息最多添加 ${MAX_IMAGES} 张图片`;
      return;
    }

    const imageFiles = list.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      error.value = "请选择图片文件";
      return;
    }

    const accepted: File[] = [];
    for (const file of imageFiles.slice(0, available)) {
      if (file.size > MAX_FILE_BYTES) {
        error.value = `「${file.name}」超过 8MB，已跳过`;
        continue;
      }
      accepted.push(file);
    }
    if (imageFiles.length > available) {
      error.value = `每条消息最多添加 ${MAX_IMAGES} 张图片，多余的图片已忽略`;
    }
    if (accepted.length === 0) return;

    isProcessing.value = true;
    try {
      for (const file of accepted) {
        const normalized = await normalizeImage(file);
        const parsed = parseDataUrl(normalized.dataUrl);
        if (!parsed) continue;
        images.value.push({
          id: createImageId(),
          name: file.name || "image",
          mimeType: parsed.mimeType,
          data: parsed.data,
          size: file.size,
          previewUrl: normalized.dataUrl,
        });
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : "图片处理失败";
    } finally {
      isProcessing.value = false;
    }
  }

  function removeImage(id: string): void {
    images.value = images.value.filter((image) => image.id !== id);
  }

  function clearImages(): void {
    images.value = [];
    error.value = null;
  }

  return {
    images,
    isProcessing,
    error,
    addFiles,
    removeImage,
    clearImages,
  };
}
