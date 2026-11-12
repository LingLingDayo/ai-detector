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
export function buildSvgPreviewDocument(
  rawContent: string,
  colorScheme: "dark" | "light" = "dark"
): string {
  const pureSvg = extractPureSvg(rawContent);
  const normalizedSvg = normalizeSvgForDisplay(pureSvg);
  const bodyColor = colorScheme === "light" ? "#1e293b" : "#e2e8f0";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
    }
    :root {
      color-scheme: ${colorScheme};
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
      color: ${bodyColor};
    }
    svg {
      width: 100% !important;
      height: 100% !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: 100% !important;
      max-height: 100% !important;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
  </style>
  ${FIT_VIEWPORT_SCRIPT}
</head>
<body>${normalizedSvg}</body>
</html>`;
}

export const FIT_VIEWPORT_SCRIPT = `
<script id="__pelican_fit_viewport_script">
(function() {
  function fitContent() {
    var root = document.documentElement;
    var body = document.body;
    if (!root || !body) return;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    if (vw <= 0 || vh <= 0) return;

    // 1. 尝试为缺少 viewBox 的 SVG 自动根据 width/height 或真实边界框 (getBBox) 补齐 viewBox
    var svgs = document.querySelectorAll('svg');
    for (var i = 0; i < svgs.length; i++) {
      var svg = svgs[i];
      if (!svg.getAttribute('viewBox')) {
        var wAttr = parseFloat(svg.getAttribute('width') || '');
        var hAttr = parseFloat(svg.getAttribute('height') || '');
        if (wAttr > 0 && hAttr > 0) {
          svg.setAttribute('viewBox', '0 0 ' + wAttr + ' ' + hAttr);
        } else if (typeof svg.getBBox === 'function') {
          try {
            var bbox = svg.getBBox();
            if (bbox && bbox.width > 0 && bbox.height > 0) {
              var pad = Math.max(bbox.width, bbox.height) * 0.04;
              svg.setAttribute(
                'viewBox',
                (bbox.x - pad) + ' ' + (bbox.y - pad) + ' ' + (bbox.width + pad * 2) + ' ' + (bbox.height + pad * 2)
              );
            }
          } catch (e) {}
        }
      }
      var par = svg.getAttribute('preserveAspectRatio');
      if (!par || !/\bmeet\b/i.test(par)) {
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }
    }

    // 2. 检查固定尺寸的子容器或画布是否超出当前视口，若超出则等比缩放使其完整居中显示
    body.style.transform = '';
    body.style.width = '';
    body.style.height = '';
    var children = body.children;
    var maxRight = 0;
    var maxBottom = 0;
    var minLeft = 0;
    var minTop = 0;

    for (var j = 0; j < children.length; j++) {
      var el = children[j];
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') continue;
      var rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.left < minLeft) minLeft = rect.left;
      if (rect.top < minTop) minTop = rect.top;
      if (rect.right > maxRight) maxRight = rect.right;
      if (rect.bottom > maxBottom) maxBottom = rect.bottom;
    }

    var contentW = Math.max(body.scrollWidth, root.scrollWidth, maxRight - Math.min(0, minLeft));
    var contentH = Math.max(body.scrollHeight, root.scrollHeight, maxBottom - Math.min(0, minTop));

    if (contentW > vw + 2 || contentH > vh + 2) {
      var scale = Math.min(vw / contentW, vh / contentH);
      if (scale > 0 && scale < 1) {
        body.style.width = contentW + 'px';
        body.style.height = contentH + 'px';
        body.style.transformOrigin = '0 0';
        var offsetX = Math.max(0, (vw - contentW * scale) / 2);
        var offsetY = Math.max(0, (vh - contentH * scale) / 2);
        body.style.transform = 'translate(' + offsetX + 'px, ' + offsetY + 'px) scale(' + scale + ')';
      }
    }
  }

  window.addEventListener('load', function() {
    fitContent();
    setTimeout(fitContent, 120);
    setTimeout(fitContent, 400);
  });
  window.addEventListener('resize', fitContent);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(fitContent, 0);
  }
})();
</script>
`;

/**
 * 构建 HTML 完整预览文档：
 * 严禁截取子 SVG，保留完整的 HTML DOM、Canvas、脚本与样式，
 * 注入防溢出、静音与自适应缩放脚本，供基准视口（800x600）或主舞台等比缩放完整渲染。
 */
export function buildHtmlPreviewDocument(
  rawContent: string,
  colorScheme: "dark" | "light" = "dark"
): string {
  if (!rawContent) return "";
  const trimmed = rawContent.trim();

  const previewStyleInjection = `
<style id="__pelican_history_preview_style">
  *, *::before, *::after {
    box-sizing: border-box;
  }
  :root {
    color-scheme: ${colorScheme};
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
${FIT_VIEWPORT_SCRIPT}
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
export function buildPelicanPreviewDocument(
  item: {
    contentType?: string;
    content: string;
  },
  colorScheme: "dark" | "light" = "dark"
): string {
  const type = resolvePelicanContentType(item.contentType, item.content);
  if (type === "html") {
    return buildHtmlPreviewDocument(item.content, colorScheme);
  }
  return buildSvgPreviewDocument(item.content, colorScheme);
}
