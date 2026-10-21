function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(raw: string): string {
  const codeSpans: string[] = [];
  let text = raw.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const token = `\uE000${codeSpans.length}\uE001`;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = escapeHtml(text);

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
    const decodedUrl = url.replace(/&amp;/g, "&");
    if (!/^(?:https?:\/\/|mailto:)/i.test(decodedUrl)) {
      return label;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  text = text.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  text = text.replace(/\uE000(\d+)\uE001/g, (_match, index: string) => {
    return codeSpans[Number(index)] ?? "";
  });

  return text;
}

/**
 * 轻量 Markdown 渲染器：先转义 HTML，再生成有限的块级/行内标签。
 * 不使用 v-html 直接渲染模型原文，避免模型输出携带脚本造成 XSS。
 */
export function renderMarkdown(source: string): string {
  if (!source || !source.trim()) return "";

  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let index = 0;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const content = paragraph.join("\n").trim();
    paragraph = [];
    if (content) {
      blocks.push(`<p>${renderInline(content).replace(/\n/g, "<br>")}</p>`);
    }
  };

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*$/.test(line)) {
      flushParagraph();
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([\w+#.-]*)\s*$/);
    if (fence) {
      flushParagraph();
      const language = fence[1] || "";
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const languageAttr = language
        ? ` class="language-${escapeHtml(language)}"`
        : "";
      blocks.push(
        `<pre><code${languageAttr}>${escapeHtml(codeLines.join("\n"))}</code></pre>`
      );
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph();
      blocks.push("<hr />");
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(
        `<blockquote>${renderInline(quoteLines.join("\n")).replace(/\n/g, "<br>")}</blockquote>`
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(renderInline(lines[index].replace(/^\s*[-*+]\s+/, "")));
        index += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(renderInline(lines[index].replace(/^\s*\d+[.)]\s+/, "")));
        index += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${item}</li>`).join("")}</ol>`);
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph();
  return blocks.join("");
}
