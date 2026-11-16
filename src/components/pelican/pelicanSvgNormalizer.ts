export type PelicanFitMode = "contain" | "cover";

/**
 * 预处理 SVG 内容，确保内部图形按指定适配模式展示：
 * 1. 若缺少 viewBox 但具备具体的 width/height 属性或内联样式，自动补充对应的 viewBox
 * 2. 若包含内联 style 中的固定宽高或最小宽高，自动清理以避免撑破父容器
 * 3. 按 fitMode 设置 preserveAspectRatio：
 *    - "contain"（默认，主舞台完整展示）：xMidYMid meet，绝不裁切
 *    - "cover"（历史缩略图铺满卡片）：xMidYMid slice，消除黑/白边并居中保留最大可视内容
 */
export function normalizeSvgForDisplay(
  svgText: string,
  fitMode: PelicanFitMode = "contain"
): string {
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

  // 3. 按适配模式设置 preserveAspectRatio，防止拉伸失真
  const targetAspectRatio =
    fitMode === "cover" ? "xMidYMid slice" : "xMidYMid meet";
  if (/\bpreserveAspectRatio\s*=/i.test(attrs)) {
    attrs = attrs.replace(
      /\bpreserveAspectRatio\s*=\s*["'][^"']*["']/i,
      `preserveAspectRatio="${targetAspectRatio}"`
    );
  } else {
    attrs = `${attrs} preserveAspectRatio="${targetAspectRatio}"`;
  }

  return svg.replace(fullTag, `<svg${attrs}>`);
}
