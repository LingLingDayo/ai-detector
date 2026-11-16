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
  var lastVw = 0;
  var lastVh = 0;

  function parseRgba(bg) {
    if (!bg || bg === 'transparent') return null;
    var m = bg.match(/rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)/i);
    if (!m) return null;
    var a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10), a: a };
  }

  function syncFallbackTextColor(root, body) {
    if (!body || !window.getComputedStyle) return;
    var bodyStyle = window.getComputedStyle(body);
    var rootStyle = window.getComputedStyle(root);
    var bg = parseRgba(bodyStyle.backgroundColor);
    if (!bg || bg.a < 0.2) {
      bg = parseRgba(rootStyle.backgroundColor);
    }
    if (!bg || bg.a < 0.2) return;

    var lum = (0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b) / 255;
    var fg = parseRgba(bodyStyle.color);
    if (!fg) return;
    var isFallbackLight = fg.r === 226 && fg.g === 232 && fg.b === 240;
    var isFallbackDark = fg.r === 30 && fg.g === 41 && fg.b === 59;
    if (lum > 0.55 && isFallbackLight) {
      body.style.color = '#1e293b';
    } else if (lum <= 0.45 && isFallbackDark) {
      body.style.color = '#e2e8f0';
    }
  }

  function collectBounds(parent, bounds) {
    var children = parent.children;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      var tag = el.tagName ? el.tagName.toUpperCase() : '';
      if (
        tag === 'SCRIPT' ||
        tag === 'STYLE' ||
        tag === 'LINK' ||
        tag === 'META' ||
        tag === 'TITLE' ||
        tag === 'NOSCRIPT' ||
        tag === 'TEMPLATE'
      ) {
        continue;
      }

      var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style && style.display === 'none') continue;

      var rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (!style || style.visibility !== 'hidden')) {
        if (rect.left < bounds.minLeft) bounds.minLeft = rect.left;
        if (rect.top < bounds.minTop) bounds.minTop = rect.top;
        if (rect.right > bounds.maxRight) bounds.maxRight = rect.right;
        if (rect.bottom > bounds.maxBottom) bounds.maxBottom = rect.bottom;
      }

      // SVG 内部坐标由 viewBox 与 preserveAspectRatio 控制；有裁切属性的容器不再向下展开被故意裁切的后代
      if (tag === 'SVG') continue;
      if (style && (style.overflowX !== 'visible' || style.overflowY !== 'visible')) {
        continue;
      }
      collectBounds(el, bounds);
    }
  }

  function fitContent() {
    var root = document.documentElement;
    var body = document.body;
    if (!root || !body) return;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    if (vw <= 0 || vh <= 0) return;
    lastVw = vw;
    lastVh = vh;

    syncFallbackTextColor(root, body);

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
      if (!par || !/\\bmeet\\b/i.test(par)) {
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }
    }

    // 2. 检查固定尺寸或偏移的子容器是否超出当前视口，若超出则等比缩放并补偿负坐标使其完整居中显示
    body.style.transform = '';
    body.style.width = '';
    body.style.height = '';

    var bounds = { minLeft: 0, minTop: 0, maxRight: 0, maxBottom: 0 };
    collectBounds(body, bounds);

    var negLeft = Math.min(0, bounds.minLeft);
    var negTop = Math.min(0, bounds.minTop);
    var contentW = Math.max(body.scrollWidth, root.scrollWidth, bounds.maxRight - negLeft);
    var contentH = Math.max(body.scrollHeight, root.scrollHeight, bounds.maxBottom - negTop);

    if (negLeft < -2 || negTop < -2 || contentW > vw + 2 || contentH > vh + 2) {
      var scale = Math.min(1, vw / contentW, vh / contentH);
      if (scale > 0 && (scale < 1 || negLeft < -2 || negTop < -2)) {
        body.style.width = contentW + 'px';
        body.style.height = contentH + 'px';
        body.style.transformOrigin = '0 0';
        var offsetX = Math.max(0, (vw - contentW * scale) / 2) - negLeft * scale;
        var offsetY = Math.max(0, (vh - contentH * scale) / 2) - negTop * scale;
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
  if (typeof ResizeObserver !== 'undefined' && document.documentElement) {
    new ResizeObserver(function() {
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      if (vw > 0 && vh > 0 && (vw !== lastVw || vh !== lastVh)) {
        fitContent();
      }
    }).observe(document.documentElement);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(fitContent, 0);
  }
})();
</script>
`;

/**
 * 构建 HTML 完整预览文档：
 * 严禁截取子 SVG，保留完整的 HTML DOM、Canvas、脚本与样式，
 * 注入防溢出、主题对比度兜底与自适应缩放脚本，供主舞台与历史记录统一完整渲染。
 */
export function buildHtmlPreviewDocument(
  rawContent: string,
  colorScheme: "dark" | "light" = "dark"
): string {
  if (!rawContent) return "";
  const trimmed = rawContent.trim();
  const bodyColor = colorScheme === "light" ? "#1e293b" : "#e2e8f0";
  const singleVisualChildBase =
    "body:has(> svg:only-of-type):not(:has(> :not(svg):not(script):not(style):not(link):not(noscript):not(template))), " +
    "body:has(> canvas:only-of-type):not(:has(> :not(canvas):not(script):not(style):not(link):not(noscript):not(template))), " +
    "body:has(> img:only-of-type):not(:has(> :not(img):not(script):not(style):not(link):not(noscript):not(template)))";

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
    background: transparent;
    overflow: hidden !important;
    user-select: none !important;
  }
  body {
    color: ${bodyColor};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  ${singleVisualChildBase} {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  ${singleVisualChildBase} > svg,
  ${singleVisualChildBase} > canvas,
  ${singleVisualChildBase} > img {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
</style>
${FIT_VIEWPORT_SCRIPT}
`;

  // 1. 如果已包含完整 HTML 文档，注入样式到 head（若无 head 则补到 html 起始标签后）
  if (/<!DOCTYPE\s+html|<html[\s>]/i.test(trimmed)) {
    if (/<head\b[^>]*>/i.test(trimmed)) {
      return trimmed.replace(
        /<head\b[^>]*>/i,
        (m) => `${m}${previewStyleInjection}`
      );
    }
    if (/<html\b[^>]*>/i.test(trimmed)) {
      return trimmed.replace(
        /<html\b[^>]*>/i,
        (m) => `${m}<head>${previewStyleInjection}</head>`
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
