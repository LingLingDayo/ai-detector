export interface ReleaseNoteSection {
  title: string;
  items: string[];
}

const COMMIT_PREFIX_REGEX = /^[a-z]+(\([^)]*\))?!?:\s*(.+)$/i;
const LINK_REF_REGEX = /^\[[^\]]+\]:\s*https?:\/\//i;
const HR_REGEX = /^(-{3,}|\*{3,}|_{3,})$/;

export function parseReleaseNotes(text: string): ReleaseNoteSection[] {
  if (!text || typeof text !== "string") {
    return [];
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: ReleaseNoteSection[] = [];
  let currentSection: ReleaseNoteSection | null = null;

  const ensureSection = (title: string): ReleaseNoteSection => {
    if (!currentSection) {
      currentSection = { title, items: [] };
      sections.push(currentSection);
    }
    return currentSection;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || HR_REGEX.test(trimmed) || LINK_REF_REGEX.test(trimmed)) {
      continue;
    }

    if (trimmed.startsWith("#")) {
      const title = trimmed.replace(/^#+\s*/, "").trim();
      currentSection = { title, items: [] };
      sections.push(currentSection);
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*+]\s+/, "").trim();
      if (content) {
        ensureSection("").items.push(content);
      }
      continue;
    }

    const commitMatch = trimmed.match(COMMIT_PREFIX_REGEX);
    if (commitMatch) {
      const content = commitMatch[2].trim();
      if (content) {
        ensureSection("").items.push(content);
      }
      continue;
    }

    if (trimmed.length >= 2 && trimmed.startsWith("*") && trimmed.endsWith("*") && !trimmed.startsWith("**")) {
      const content = trimmed.slice(1, -1).trim();
      if (content) {
        ensureSection("").items.push(content);
      }
      continue;
    }

    currentSection = { title: trimmed, items: [] };
    sections.push(currentSection);
  }

  return sections.filter((section) => section.items.length > 0);
}
