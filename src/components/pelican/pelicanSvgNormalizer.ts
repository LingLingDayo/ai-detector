/**
 * 预处理 SVG 内容，确保内部图形以不拉伸的缩放方式尽量充满容器且完整展示不裁剪：
 * 1. 若缺少 viewBox 但具备具体的 width/height 属性或内联样式，自动补充对应的 viewBox
 * 2. 若包含内联 style 中的固定宽高或最小宽高，自动清理以避免撑破父容器
 * 3. 确保 preserveAspectRatio="xMidYMid meet"（防止因缺失、none 或 slice 导致拉伸失真或边缘裁切）
 */
export function normalizeSvgForDisplay(svgText: string): string {
  if (!svgText) return "";
  const svg = svgText.trim();
  const svgTagMatch = svg.match(/<svg\b([^>]*)>/i);
  if (!svgTagMatch) return svg;

  const fullTag = svgTagMatch[0];
  let attrs = svgTagMatch[1];

  // 提取内联 style 属性（若存在）
  const styleMatch = attrs.match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i);
  const inlineStyle = styleMatch ? styleMatch[2] : "";

  // 1. 如果缺少 viewBox，尝试从 width/height 属性或内联 style 中提取尺寸并注入 viewBox
  if (!/\bviewBox\s*=/i.test(attrs)) {
    const attrW = attrs.match(/\bwidth\s*=\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/i);
    const attrH = attrs.match(/\bheight\s*=\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/i);
    const styleW = inlineStyle.match(/(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)(?:px)?/i);
    const styleH = inlineStyle.match(/(?:^|;)\s*height\s*:\s*(\d+(?:\.\d+)?)(?:px)?/i);

    const w = attrW?.[1] || styleW?.[1];
    const h = attrH?.[1] || styleH?.[1];
    if (w && h) {
      attrs = `${attrs} viewBox="0 0 ${w} ${h}"`;
    }
  }

  // 2. 清理内联 style 中写死的 width / height / min-width / min-height / max-width / max-height，防止覆盖自适应样式
  if (styleMatch) {
    const quote = styleMatch[1];
    const cleanedDecls = inlineStyle
      .split(";")
      .map((decl) => decl.trim())
      .filter(
        (decl) =>
          decl.length > 0 &&
          !/^(?:(?:min|max)-)?(?:width|height)\s*:/i.test(decl)
      );
    if (cleanedDecls.length > 0) {
      attrs = attrs.replace(styleMatch[0], `style=${quote}${cleanedDecls.join("; ")}${quote}`);
    } else {
      attrs = attrs.replace(styleMatch[0], "");
    }
  }

  // 3. 确保 preserveAspectRatio 为等比自适应且完整显示 (meet)，纠正 none 或 slice
  if (/\bpreserveAspectRatio\s*=/i.test(attrs)) {
    attrs = attrs.replace(
      /\bpreserveAspectRatio\s*=\s*["'][^"']*["']/i,
      'preserveAspectRatio="xMidYMid meet"'
    );
  } else {
    attrs = `${attrs} preserveAspectRatio="xMidYMid meet"`;
  }

  return svg.replace(fullTag, `<svg${attrs}>`);
}
