import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("连接测试 Markdown 渲染", () => {
  it("渲染标题、列表、引用与代码块", () => {
    const html = renderMarkdown(
      "# 标题\n\n- 第一项\n- 第二项\n\n> 引用内容\n\n```ts\nconst a = 1 < 2;\n```"
    );

    expect(html).toContain("<h1>标题</h1>");
    expect(html).toContain("<ul><li>第一项</li><li>第二项</li></ul>");
    expect(html).toContain("<blockquote>引用内容</blockquote>");
    expect(html).toContain('<pre><code class="language-ts">const a = 1 &lt; 2;</code></pre>');
  });

  it("支持粗体、斜体、删除线与行内代码", () => {
    const html = renderMarkdown("**粗体** *斜体* ~~删除~~ `const x = 1`");
    expect(html).toContain("<strong>粗体</strong>");
    expect(html).toContain("<em>斜体</em>");
    expect(html).toContain("<del>删除</del>");
    expect(html).toContain("<code>const x = 1</code>");
  });

  it("只允许安全协议的链接", () => {
    const html = renderMarkdown("[OpenAI](https://openai.com)");
    expect(html).toContain(
      '<a href="https://openai.com" target="_blank" rel="noopener noreferrer">OpenAI</a>'
    );

    const unsafe = renderMarkdown("[点我](javascript:alert(1))");
    expect(unsafe).not.toContain("<a");
    expect(unsafe).toContain("点我");
  });

  it("转义模型输出中的 HTML，防止脚本注入", () => {
    const html = renderMarkdown('<script>alert("x")</script><img src=x onerror=alert(1)>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("流式输出中未闭合的代码块也能稳定渲染", () => {
    const html = renderMarkdown("```js\nconst value = ");
    expect(html).toContain('<pre><code class="language-js">const value = </code></pre>');
  });
});
