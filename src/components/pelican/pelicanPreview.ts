import { normalizeSvgForDisplay } from "./pelicanSvgNormalizer";

export type PelicanContentType = "svg" | "html";

/**
 * 智能判定鹈鹕测试项的展现类型
 */
export function resolvePelicanContentType(
  contentType?: string,
  content?: string
): PelicanContentType {
  if (contentType === "html" || contentType === "svg") {
    return contentType;
  }

  const trimmed = (content || "").trim();
  if (!trimmed) {
    return "svg";
  }

  // 1. 包含标准 HTML 文档标签
  if (/<!DOCTYPE\s+html|<html[\s>]/i.test(trimmed)) {
    return "html";
  }

  // 2. 包含典型的富 HTML 结构标签
  if (
    /<(?:head|body|canvas|style|script|div|main|section|article)[\s>]/i.test(
      trimmed
    )
  ) {
    return "html";
  }

  return "svg";
}

/**
 * 从可能带有前导/后缀文本或 Markdown 围栏的内容中提取纯 SVG
 */
export function extractPureSvg(rawContent: string): string {
  if (!rawContent) return "";
  const trimmed = rawContent.trim();
  const svgMatch = trimmed.match(/<svg[\s\S]*?<\/svg>/i);
  return svgMatch ? svgMatch[0] : trimmed;
}

/**
 * 构建 SVG 缩略图预览文档：
 * 保证使用 preserveAspectRatio="xMidYMid meet" 且补齐 viewBox，
 * 居中等比充满但绝对不裁切任何主体边缘。
 */
export function buildSvgPreviewDocument(rawContent: string): string {
  const pureSvg = extractPureSvg(rawContent);
  const normalizedSvg = normalizeSvgForDisplay(pureSvg);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    svg {
      width: 100% !important;
      height: 100% !important;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
  </style>
</head>
<body>${normalizedSvg}</body>
</html>`;
}

/**
 * 构建 HTML 完整预览文档：
 * 严禁截取子 SVG，保留完整的 HTML DOM、Canvas、脚本与样式，
 * 注入防溢出与静音样式，供基准视口（800x600）等比缩放渲染。
 */
export function buildHtmlPreviewDocument(rawContent: string): string {
  if (!rawContent) return "";
  const trimmed = rawContent.trim();

  const previewStyleInjection = `
<style id="__pelican_history_preview_style">
  *, *::before, *::after {
    box-sizing: border-box;
  }
  html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden !important;
    user-select: none !important;
  }
  video, audio {
    display: none !important;
  }
</style>
`;

  // 1. 如果已包含完整 HTML 文档，注入样式到 head 或开头
  if (/<!DOCTYPE\s+html|<html[\s>]/i.test(trimmed)) {
    if (/<head[\s>]/i.test(trimmed)) {
      return trimmed.replace(
        /<head[\s>]/i,
        (m) => `${m}${previewStyleInjection}`
      );
    }
    return `${previewStyleInjection}${trimmed}`;
  }

  // 2. 如果是富 HTML 代码片段，包裹为标准 HTML5 文档
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=800, initial-scale=1.0">
  ${previewStyleInjection}
</head>
<body>
  ${trimmed}
</body>
</html>`;
}

/**
 * 根据项目类型生成对应的预览 HTML
 */
export function buildPelicanPreviewDocument(item: {
  contentType?: string;
  content: string;
}): string {
  const type = resolvePelicanContentType(item.contentType, item.content);
  if (type === "html") {
    return buildHtmlPreviewDocument(item.content);
  }
  return buildSvgPreviewDocument(item.content);
}
