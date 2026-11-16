import { describe, expect, it } from "vitest";
import {
  resolvePelicanContentType,
  extractPureSvg,
  buildSvgPreviewDocument,
  buildHtmlPreviewDocument,
  buildPelicanPreviewDocument,
} from "./pelicanPreview";

describe("pelicanPreview", () => {
  describe("resolvePelicanContentType", () => {
    it("当明确指定 contentType 为 html 或 svg 时直接返回", () => {
      expect(resolvePelicanContentType("html", "<svg></svg>")).toBe("html");
      expect(resolvePelicanContentType("svg", "<div></div>")).toBe("svg");
    });

    it("当 contentType 缺失时，通过内容特征智能推断", () => {
      expect(resolvePelicanContentType(undefined, "<!DOCTYPE html><html><body>ok</body></html>")).toBe("html");
      expect(resolvePelicanContentType(undefined, "<html lang='zh'><div>hello</div></html>")).toBe("html");
      expect(resolvePelicanContentType(undefined, "<div class='container'><canvas></canvas></div>")).toBe("html");
      expect(resolvePelicanContentType(undefined, "<svg viewBox='0 0 100 100'><circle/></svg>")).toBe("svg");
      expect(resolvePelicanContentType(undefined, "")).toBe("svg");
    });
  });

  describe("extractPureSvg", () => {
    it("正确提取带有前缀或后缀文本中的 SVG 代码", () => {
      const raw = "这是说明文本：\n<svg width='100' height='100'><rect/></svg>\n请查看";
      expect(extractPureSvg(raw)).toBe("<svg width='100' height='100'><rect/></svg>");
    });
  });

  describe("buildSvgPreviewDocument", () => {
    it("使用 meet 保持图形完整展示，绝不出现 slice 强制裁剪", () => {
      const rawSvg = '<svg width="400" height="400"><circle cx="200" cy="200" r="100"/></svg>';
      const doc = buildSvgPreviewDocument(rawSvg);

      expect(doc).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(doc).not.toContain("slice");
      expect(doc).toContain('viewBox="0 0 400 400"');
      expect(doc).toContain("object-fit: contain");
    });

    it("当原本为 slice 时由 normalizer 纠正为保持等比的规范形态", () => {
      const rawSvg = '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><path d="M0 0"/></svg>';
      const doc = buildSvgPreviewDocument(rawSvg);
      expect(doc).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(doc).not.toContain("slice");
    });

    it("注入与主题一致的 color-scheme 及自适应脚本，防止 SVG 填充失效变黑", () => {
      const rawSvg = '<svg viewBox="0 0 100 100"><path d="M0 0"/></svg>';
      const lightDoc = buildSvgPreviewDocument(rawSvg, "light");
      expect(lightDoc).toContain("color-scheme: light;");
      expect(lightDoc).toContain("__pelican_fit_viewport_script");
    });
  });

  describe("buildHtmlPreviewDocument", () => {
    it("当 HTML 包含子 SVG（如暂停按钮）时，绝对保留整个 HTML，不被截断为单个 SVG", () => {
      const htmlWithSvgButton = `<!DOCTYPE html>
<html>
<head><title>散步中的丹顶鹤</title></head>
<body>
  <div class="card">
    <h1>散步中的丹顶鹤</h1>
    <button class="pause-btn">
      <svg class="icon" viewBox="0 0 24 24">
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
      </svg>
    </button>
    <div class="crane-animation">丹顶鹤推车主体内容</div>
  </div>
</body>
</html>`;

      const doc = buildHtmlPreviewDocument(htmlWithSvgButton);

      // 验证保留了完整的 HTML 结构，而不是只剩下一个 <svg>
      expect(doc).toContain("散步中的丹顶鹤");
      expect(doc).toContain("丹顶鹤推车主体内容");
      expect(doc).toContain("pause-btn");
      expect(doc).toContain("__pelican_history_preview_style");
      expect(doc).toContain("overflow: hidden !important;");
      expect(doc).not.toContain("video, audio");
      expect(doc).not.toContain("background-color: transparent !important");
    });

    it("当传入富 HTML 片段时自动补全 HTML5 骨架", () => {
      const snippet = '<div class="banner"><span>动画标语</span></div>';
      const doc = buildHtmlPreviewDocument(snippet);

      expect(doc).toContain("<!DOCTYPE html>");
      expect(doc).toContain('<meta name="viewport" content="width=800, initial-scale=1.0">');
      expect(doc).toContain("动画标语");
    });

    it("带属性的 head 标签和无 head 的 html 文档都能正确注入样式与适配脚本", () => {
      const headWithAttr = '<!DOCTYPE html><html><head data-env="prod"><title>t</title></head><body><canvas></canvas></body></html>';
      const noHead = '<!DOCTYPE html><html lang="en"><body><div class="box">hi</div></body></html>';

      const doc1 = buildHtmlPreviewDocument(headWithAttr, "light");
      const doc2 = buildHtmlPreviewDocument(noHead, "dark");

      expect(doc1).toContain('<head data-env="prod">\n<style id="__pelican_history_preview_style">');
      expect(doc2).toContain('<html lang="en"><head>');
      expect(doc2).toContain("ResizeObserver");
      expect(doc2).toContain("syncFallbackTextColor");
    });

    it("仅在 body 只有单一 svg/canvas/img 视觉元素时做居中撑满约束，多元素页面保留文档流", () => {
      const doc = buildHtmlPreviewDocument("<div>多元素</div><canvas></canvas>");
      expect(doc).toContain("body:has(> canvas:only-of-type)");
      expect(doc).not.toMatch(/^\s*body\s*\{[^}]*display:\s*flex/m);
    });
  });

  describe("buildPelicanPreviewDocument", () => {
    it("正确分发 HTML 与 SVG 的预览文档生成", () => {
      const htmlItem = {
        contentType: "html" as const,
        content: "<div class='test'>HTML 卡片</div>",
      };
      const svgItem = {
        contentType: "svg" as const,
        content: "<svg viewBox='0 0 10 10'><rect/></svg>",
      };

      const htmlDoc = buildPelicanPreviewDocument(htmlItem);
      const svgDoc = buildPelicanPreviewDocument(svgItem);

      expect(htmlDoc).toContain("HTML 卡片");
      expect(svgDoc).toContain("<svg");
      expect(svgDoc).toContain('preserveAspectRatio="xMidYMid meet"');
    });
    it("cover 模式用于历史卡片铺满无黑边白边，contain 模式用于主舞台完整展示", () => {
      const svgItem = {
        contentType: "svg" as const,
        content: '<svg viewBox="0 0 500 500"><rect width="500" height="500"/></svg>',
      };
      const htmlItem = {
        contentType: "html" as const,
        content: "<canvas width='500' height='500'></canvas>",
      };

      const svgCover = buildPelicanPreviewDocument(svgItem, "dark", "cover");
      const svgContain = buildPelicanPreviewDocument(svgItem, "dark", "contain");
      const htmlCover = buildPelicanPreviewDocument(htmlItem, "dark", "cover");
      const htmlContain = buildPelicanPreviewDocument(htmlItem, "dark", "contain");

      expect(svgCover).toContain('preserveAspectRatio="xMidYMid slice"');
      expect(svgCover).toContain("object-fit: cover;");
      expect(svgContain).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(svgContain).toContain("object-fit: contain;");

      expect(htmlCover).toContain("object-fit: cover;");
      expect(htmlCover).toContain("FIT_MODE = 'cover'");
      expect(htmlContain).toContain("object-fit: contain;");
      expect(htmlContain).toContain("FIT_MODE = 'contain'");
    });
  });
});
