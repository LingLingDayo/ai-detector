/**
 * 预处理 SVG 内容，确保内部图形以不拉伸的缩放方式尽量充满容器且完整展示不裁剪：
 * 1. 若缺少 viewBox 但具备具体的 width/height 属性，自动补充对应的 viewBox
 * 2. 确保 preserveAspectRatio="xMidYMid meet"（防止因缺失或 none 导致拉伸失真）
 */
export function normalizeSvgForDisplay(svgText: string): string {
  if (!svgText) return "";
  const svg = svgText.trim();
  const svgTagMatch = svg.match(/<svg\b([^>]*)>/i);
  if (!svgTagMatch) return svg;

  const fullTag = svgTagMatch[0];
  let attrs = svgTagMatch[1];

  // 1. 如果缺少 viewBox 但具备有效的 width / height 属性，为其自动注入 viewBox
  if (!/\bviewBox\s*=/i.test(attrs)) {
    const wMatch = attrs.match(/\bwidth\s*=\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/i);
    const hMatch = attrs.match(/\bheight\s*=\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/i);
    if (wMatch && hMatch) {
      const w = wMatch[1];
      const h = hMatch[1];
      attrs = `${attrs} viewBox="0 0 ${w} ${h}"`;
    }
  }

  // 2. 确保 preserveAspectRatio 为等比自适应且完整显示 (meet)
  if (/\bpreserveAspectRatio\s*=\s*["']none["']/i.test(attrs)) {
    attrs = attrs.replace(/\bpreserveAspectRatio\s*=\s*["']none["']/i, 'preserveAspectRatio="xMidYMid meet"');
  } else if (!/\bpreserveAspectRatio\s*=/i.test(attrs)) {
    attrs = `${attrs} preserveAspectRatio="xMidYMid meet"`;
  }

  return svg.replace(fullTag, `<svg${attrs}>`);
}
