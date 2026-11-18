const SVG_TOKEN = /<svg\b(?:[^>"']|"[^"]*"|'[^']*')*>|<\/svg\s*>/gi;

/**
 * 提取首个配平的 <svg>…</svg> 块。
 * 非贪婪正则会在第一个嵌套 </svg> 处提前截断，丢失外层后续图形，故按标签深度扫描。
 * 未配平（流式截断）或不含 svg 时返回 null，交由调用方走兜底逻辑。
 */
export function extractSvgBlock(text: string): string | null {
  if (!text) return null;
  const start = text.search(/<svg\b/i);
  if (start === -1) return null;

  SVG_TOKEN.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = SVG_TOKEN.exec(text)) !== null) {
    const token = match[0];
    if (token.startsWith("</")) {
      depth -= 1;
      if (depth === 0) return text.slice(start, match.index + token.length);
    } else if (!/\/>$/.test(token)) {
      depth += 1;
    } else if (depth === 0) {
      return token;
    }
  }
  return null;
}