import type { CandyChallenge, CandyEvaluationResult } from "../types";
import { getTauriInvoke, isTauriApp } from "../services/api";

function randomInt(min: number, maxInclusive: number): number {
  if (min >= maxInclusive) return min;
  const span = maxInclusive - min + 1;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const limit = Math.floor(0x100000000 / span) * span;
    const buffer = new Uint32Array(1);
    do {
      crypto.getRandomValues(buffer);
    } while (buffer[0] >= limit);
    return min + (buffer[0] % span);
  }
  return min + Math.floor(Math.random() * span);
}

function generateRandomId(index: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `candy-${index + 1}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `candy-${index + 1}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * 求解给定糖果矩阵下的最少摸取总数与最优分配
 */
export function solveCandyCounts(
  circleApple: number,
  circlePeach: number,
  circleWatermelon: number,
  starApple: number,
  starPeach: number,
  starWatermelon: number
): { expectedAnswer: number; optimalCircle: number; optimalStar: number } {
  const totalC = circleApple + circlePeach + circleWatermelon;
  const totalS = starApple + starPeach + starWatermelon;

  const minC = circleWatermelon + 1;
  const minS = starWatermelon + 1;

  let best: { expectedAnswer: number; optimalCircle: number; optimalStar: number } | null = null;

  for (let c = minC; c <= totalC; c++) {
    for (let s = minS; s <= totalS; s++) {
      const breakNoApple =
        c > circlePeach + circleWatermelon || s > starPeach + starWatermelon;
      const breakNoPeach =
        c > circleApple + circleWatermelon || s > starApple + starWatermelon;

      if (breakNoApple && breakNoPeach) {
        const total = c + s;
        if (!best || total < best.expectedAnswer) {
          best = {
            expectedAnswer: total,
            optimalCircle: c,
            optimalStar: s,
          };
        }
      }
    }
  }

  return (
    best ?? {
      expectedAnswer: totalC + totalS,
      optimalCircle: totalC,
      optimalStar: totalS,
    }
  );
}

export function buildCandyPrompt(
  circleApple: number,
  circlePeach: number,
  circleWatermelon: number,
  starApple: number,
  starPeach: number,
  starWatermelon: number
): string {
  return (
    "在一个黑色的袋子里放有三种口味的糖果，每种糖果有两种不同的形状（圆形和五角星形，不同的形状靠手感可以分辨）。现已知不同口味的糖和不同形状的数量统计如下表。参赛者需要在活动前决定摸出的糖果数目，那么，最少取出多少个糖果才能保证手中同时拥有不同形状的苹果味和桃子味的糖？（同时手中有圆形苹果味匹配五角星桃子味糖果，或者有圆形桃子味匹配五角星苹果味糖果都满足要求）\n\n" +
    "| 形状 | 苹果味 | 桃子味 | 西瓜味 |\n" +
    "| :---: | :---: | :---: | :---: |\n" +
    `| 圆形 | ${circleApple} | ${circlePeach} | ${circleWatermelon} |\n` +
    `| 五角星形 | ${starApple} | ${starPeach} | ${starWatermelon} |\n\n` +
    "请先进行逐步逻辑推理，并在回答的最后一行单独输出格式：`最终答案：X`（其中 X 为你计算出的最少糖果数量整数）。"
  );
}

function parseFirstPositiveIntAfter(segment: string): number | null {
  const slice = segment.slice(0, 48);
  let digits = "";
  let started = false;

  for (const ch of slice) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      started = true;
    } else if (started) {
      break;
    } else if ((ch === "\n" || ch === "\r") && digits.length > 0) {
      break;
    }
  }

  if (!digits) return null;
  const num = Number.parseInt(digits, 10);
  return Number.isFinite(num) && num > 0 && num <= 999 ? num : null;
}

/**
 * 从模型输出文本中提取最终数字答案（与 Rust 后端逻辑严格同构）
 */
export function extractCandyAnswer(responseText: string): number | null {
  const trimmed = (responseText || "").trim();
  if (!trimmed) return null;

  // 1. 优先匹配 LaTeX \boxed{X}
  const boxedIdx = trimmed.lastIndexOf("\\boxed{");
  if (boxedIdx !== -1) {
    const after = trimmed.slice(boxedIdx + 7);
    const endIdx = after.indexOf("}");
    if (endIdx !== -1) {
      const num = parseFirstPositiveIntAfter(after.slice(0, endIdx));
      if (num !== null) return num;
    }
  }

  // 2. 匹配明确的最终答案标记（取最后一次出现）
  const explicitMarkers = [
    "最终答案",
    "正确答案",
    "标准答案",
    "最终结果",
    "答案是",
    "答案为",
    "答案：",
    "答案:",
    "Answer:",
    "Answer is",
  ];
  let bestMarkerPos = -1;
  let bestMarkerNum: number | null = null;
  for (const marker of explicitMarkers) {
    const idx = trimmed.lastIndexOf(marker);
    if (idx !== -1 && idx > bestMarkerPos) {
      const after = trimmed.slice(idx + marker.length);
      const num = parseFirstPositiveIntAfter(after);
      if (num !== null) {
        bestMarkerPos = idx;
        bestMarkerNum = num;
      }
    }
  }
  if (bestMarkerNum !== null) return bestMarkerNum;

  // 3. 检查最后一行非空行是否为纯数字
  const nonEmptyLines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (nonEmptyLines.length > 0) {
    const lastLine = nonEmptyLines[nonEmptyLines.length - 1];
    const cleanLine = lastLine.replace(/[*#`_~\s。.！!【】[\]()（）个颗]/g, "");
    if (/^\d+$/.test(cleanLine)) {
      const num = Number.parseInt(cleanLine, 10);
      if (num > 0 && num <= 999) return num;
    }
  }

  // 4. 匹配结论句式
  const conclusionMarkers = [
    "最少取出",
    "最少需要取出",
    "最少要取出",
    "最少摸出",
    "最少需要摸出",
    "最少需要",
    "最少要",
    "至少取出",
    "至少需要取出",
    "至少摸出",
    "至少需要",
    "共需取出",
    "总共取出",
  ];
  let bestConclusionPos = -1;
  let bestConclusionNum: number | null = null;
  for (const marker of conclusionMarkers) {
    const idx = trimmed.lastIndexOf(marker);
    if (idx !== -1 && idx > bestConclusionPos) {
      const after = trimmed.slice(idx + marker.length);
      const num = parseFirstPositiveIntAfter(after);
      if (num !== null) {
        bestConclusionPos = idx;
        bestConclusionNum = num;
      }
    }
  }
  if (bestConclusionNum !== null) return bestConclusionNum;

  // 5. 兜底提取最后 3 行中的最后一个合理整数 (1..=500)
  const tailLines = nonEmptyLines.slice(-3);
  let lastValid: number | null = null;
  for (const line of tailLines) {
    const matches = line.match(/\d+/g);
    if (matches) {
      for (const m of matches) {
        const n = Number.parseInt(m, 10);
        if (n >= 1 && n <= 500) {
          lastValid = n;
        }
      }
    }
  }

  return lastValid;
}

export function generateSingleCandyChallengeSync(
  index: number = 0,
  excludeAnswers: number[] = []
): CandyChallenge {
  for (let attempt = 0; attempt < 80; attempt++) {
    const circleApple = randomInt(5, 14);
    const circlePeach = randomInt(5, 14);
    const circleWatermelon = randomInt(4, 11);

    const starApple = randomInt(5, 14);
    const starPeach = randomInt(5, 14);
    const starWatermelon = randomInt(3, 10);

    const maxC = Math.max(circleApple, circlePeach);
    const maxS = Math.max(starApple, starPeach);
    if (maxC === maxS) continue;
    if (circleApple === circlePeach && starApple === starPeach) continue;

    const { expectedAnswer, optimalCircle, optimalStar } = solveCandyCounts(
      circleApple,
      circlePeach,
      circleWatermelon,
      starApple,
      starPeach,
      starWatermelon
    );

    if (excludeAnswers.includes(expectedAnswer)) continue;

    const totalCircle = circleApple + circlePeach + circleWatermelon;
    const totalStar = starApple + starPeach + starWatermelon;
    const blindWorst1 = totalCircle + starWatermelon + 1;
    const blindWorst2 = totalStar + circleWatermelon + 1;
    if (expectedAnswer >= blindWorst1 || expectedAnswer >= blindWorst2) continue;

    return {
      id: generateRandomId(index),
      circleApple,
      circlePeach,
      circleWatermelon,
      starApple,
      starPeach,
      starWatermelon,
      expectedAnswer,
      optimalCircle,
      optimalStar,
      prompt: buildCandyPrompt(
        circleApple,
        circlePeach,
        circleWatermelon,
        starApple,
        starPeach,
        starWatermelon
      ),
    };
  }

  const fallback = solveCandyCounts(8, 10, 7, 6, 8, 5);
  return {
    id: generateRandomId(index),
    circleApple: 8,
    circlePeach: 10,
    circleWatermelon: 7,
    starApple: 6,
    starPeach: 8,
    starWatermelon: 5,
    ...fallback,
    prompt: buildCandyPrompt(8, 10, 7, 6, 8, 5),
  };
}

export function generateCandyChallengesSync(count: number = 3): CandyChallenge[] {
  const challenges: CandyChallenge[] = [];
  const usedAnswers: number[] = [];

  for (let i = 0; i < count; i++) {
    const ch = generateSingleCandyChallengeSync(i, usedAnswers);
    usedAnswers.push(ch.expectedAnswer);
    challenges.push(ch);
  }

  return challenges;
}

/**
 * 优先调用 Rust 后端生成一组糖果测试题目，Web 环境自动回退
 */
export async function fetchCandyChallenges(count: number = 3): Promise<CandyChallenge[]> {
  const invoke = getTauriInvoke();
  if (invoke && isTauriApp()) {
    try {
      return await invoke<CandyChallenge[]>("generate_candy_challenges", { count });
    } catch {
      // 回退至前端同构生成器
    }
  }
  return generateCandyChallengesSync(count);
}

/**
 * 优先调用 Rust 后端生成单道糖果测试题目，Web 环境自动回退
 */
export async function fetchSingleCandyChallenge(
  index: number,
  excludeAnswers: number[] = []
): Promise<CandyChallenge> {
  const invoke = getTauriInvoke();
  if (invoke && isTauriApp()) {
    try {
      return await invoke<CandyChallenge>("generate_single_candy_challenge", {
        index,
        excludeAnswers,
      });
    } catch {
      // 回退至前端同构生成器
    }
  }
  return generateSingleCandyChallengeSync(index, excludeAnswers);
}

/**
 * 优先调用 Rust 后端判分，Web 环境自动回退
 */
export async function evaluateCandyResponse(
  responseText: string,
  expectedAnswer: number
): Promise<CandyEvaluationResult> {
  const invoke = getTauriInvoke();
  if (invoke && isTauriApp()) {
    try {
      return await invoke<CandyEvaluationResult>("evaluate_candy_answer", {
        responseText,
        expectedAnswer,
      });
    } catch {
      // 回退至前端同构解析器
    }
  }
  const extractedAnswer = extractCandyAnswer(responseText);
  return {
    extractedAnswer,
    isCorrect: extractedAnswer === expectedAnswer,
  };
}
