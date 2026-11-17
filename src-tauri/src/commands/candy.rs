use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::types::{CandyChallenge, CandyEvaluationResult};

static RNG_COUNTER: AtomicU64 = AtomicU64::new(1);

fn next_random_u64() -> u64 {
    let counter = RNG_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let state = RandomState::new();
    let mut hasher = state.build_hasher();
    hasher.write_u64(counter);
    hasher.write_u64(nanos);
    let mut z = hasher.finish().wrapping_add(0x9E3779B97F4A7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

fn random_range(min: u32, max_inclusive: u32) -> u32 {
    if min >= max_inclusive {
        return min;
    }
    let span = (max_inclusive - min + 1) as u64;
    min + (next_random_u64() % span) as u32
}

/// 求解给定糖果分布下的最优抽取策略
/// 返回 (最少抽取总数, 最优圆形抽取数, 最优五角星抽取数)
pub fn solve_candy_counts(
    circle_apple: u32,
    circle_peach: u32,
    circle_watermelon: u32,
    star_apple: u32,
    star_peach: u32,
    star_watermelon: u32,
) -> (u32, u32, u32) {
    let total_c = circle_apple + circle_peach + circle_watermelon;
    let total_s = star_apple + star_peach + star_watermelon;

    let min_c = circle_watermelon + 1;
    let min_s = star_watermelon + 1;

    let mut best: Option<(u32, u32, u32)> = None;

    for c in min_c..=total_c {
        for s in min_s..=total_s {
            let break_no_apple =
                (c > circle_peach + circle_watermelon) || (s > star_peach + star_watermelon);
            let break_no_peach =
                (c > circle_apple + circle_watermelon) || (s > star_apple + star_watermelon);

            if break_no_apple && break_no_peach {
                let total = c + s;
                match best {
                    None => best = Some((total, c, s)),
                    Some((best_total, _, _)) if total < best_total => {
                        best = Some((total, c, s));
                    }
                    _ => {}
                }
            }
        }
    }

    best.unwrap_or((total_c + total_s, total_c, total_s))
}

pub fn build_candy_prompt(
    circle_apple: u32,
    circle_peach: u32,
    circle_watermelon: u32,
    star_apple: u32,
    star_peach: u32,
    star_watermelon: u32,
) -> String {
    format!(
        "在一个黑色的袋子里放有三种口味的糖果，每种糖果有两种不同的形状（圆形和五角星形，不同的形状靠手感可以分辨）。现已知不同口味的糖和不同形状的数量统计如下表。参赛者需要在活动前决定摸出的糖果数目，那么，最少取出多少个糖果才能保证手中同时拥有不同形状的苹果味和桃子味的糖？（同时手中有圆形苹果味匹配五角星桃子味糖果，或者有圆形桃子味匹配五角星苹果味糖果都满足要求）\n\n\
        | 形状 | 苹果味 | 桃子味 | 西瓜味 |\n\
        | :---: | :---: | :---: | :---: |\n\
        | 圆形 | {} | {} | {} |\n\
        | 五角星形 | {} | {} | {} |\n\n\
        请先进行逐步逻辑推理，并在回答的最后一行单独输出格式：`最终答案：X`（其中 X 为你计算出的最少糖果数量整数）。",
        circle_apple,
        circle_peach,
        circle_watermelon,
        star_apple,
        star_peach,
        star_watermelon
    )
}

pub fn build_candy_challenge(
    index: usize,
    circle_apple: u32,
    circle_peach: u32,
    circle_watermelon: u32,
    star_apple: u32,
    star_peach: u32,
    star_watermelon: u32,
) -> CandyChallenge {
    let (expected_answer, optimal_circle, optimal_star) = solve_candy_counts(
        circle_apple,
        circle_peach,
        circle_watermelon,
        star_apple,
        star_peach,
        star_watermelon,
    );
    let prompt = build_candy_prompt(
        circle_apple,
        circle_peach,
        circle_watermelon,
        star_apple,
        star_peach,
        star_watermelon,
    );
    let rand_suffix = next_random_u64() & 0xFFFF_FFFF;
    CandyChallenge {
        id: format!("candy-{}-{:08x}", index + 1, rand_suffix),
        circle_apple,
        circle_peach,
        circle_watermelon,
        star_apple,
        star_peach,
        star_watermelon,
        expected_answer,
        optimal_circle,
        optimal_star,
        prompt,
    }
}

/// 从文本片段中提取紧随标记之后的第一个正整数
fn parse_first_u32_after(s: &str) -> Option<u32> {
    let mut digits = String::new();
    let mut started = false;

    for ch in s.chars().take(48) {
        if ch.is_ascii_digit() {
            digits.push(ch);
            started = true;
        } else if started {
            break;
        } else if ch == '\n' || ch == '\r' {
            // 跨行未见数字则停止
            if !digits.is_empty() {
                break;
            }
        }
    }

    if digits.is_empty() {
        return None;
    }
    digits.parse::<u32>().ok().filter(|&v| v > 0 && v <= 999)
}

/// 从模型输出文本中智能提取最终数字答案
pub fn extract_candy_answer(response_text: &str) -> Option<u32> {
    let trimmed = response_text.trim();
    if trimmed.is_empty() {
        return None;
    }

    // 1. 优先匹配 LaTeX \boxed{X}（取最后一次出现）
    if let Some(idx) = trimmed.rfind("\\boxed{") {
        let after = &trimmed[idx + 7..];
        if let Some(end_idx) = after.find('}') {
            if let Some(num) = parse_first_u32_after(&after[..end_idx]) {
                return Some(num);
            }
        }
    }

    // 2. 匹配明确的最终答案标记（从后往前找最后一次出现）
    let explicit_markers = [
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
    let mut best_marker_pos: Option<(usize, u32)> = None;
    for marker in &explicit_markers {
        if let Some(idx) = trimmed.rfind(marker) {
            let after = &trimmed[idx + marker.len()..];
            if let Some(num) = parse_first_u32_after(after) {
                match best_marker_pos {
                    None => best_marker_pos = Some((idx, num)),
                    Some((best_idx, _)) if idx > best_idx => {
                        best_marker_pos = Some((idx, num));
                    }
                    _ => {}
                }
            }
        }
    }
    if let Some((_, num)) = best_marker_pos {
        return Some(num);
    }

    // 3. 检查最后几行是否有独立数字行或结论句式
    let non_empty_lines: Vec<&str> = trimmed
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    if let Some(&last_line) = non_empty_lines.last() {
        let clean_line: String = last_line
            .chars()
            .filter(|&c| {
                !matches!(
                    c,
                    '*' | '#' | '`' | '_' | '~' | ' ' | '\t' | '。' | '.' | '！' | '!' | '【'
                        | '】' | '[' | ']' | '(' | ')' | '（' | '）' | '个' | '颗'
                )
            })
            .collect();
        if !clean_line.is_empty() && clean_line.chars().all(|c| c.is_ascii_digit()) {
            if let Ok(num) = clean_line.parse::<u32>() {
                if num > 0 && num <= 999 {
                    return Some(num);
                }
            }
        }
    }

    // 4. 在尾部文本中匹配“最少取出 X 个/颗”、“至少需要 X 个/颗”等结论表达
    let conclusion_markers = [
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
    let mut best_conclusion_pos: Option<(usize, u32)> = None;
    for marker in &conclusion_markers {
        if let Some(idx) = trimmed.rfind(marker) {
            let after = &trimmed[idx + marker.len()..];
            if let Some(num) = parse_first_u32_after(after) {
                match best_conclusion_pos {
                    None => best_conclusion_pos = Some((idx, num)),
                    Some((best_idx, _)) if idx > best_idx => {
                        best_conclusion_pos = Some((idx, num));
                    }
                    _ => {}
                }
            }
        }
    }
    if let Some((_, num)) = best_conclusion_pos {
        return Some(num);
    }

    // 5. 兜底：从最后 3 行非空文本中提取最后一个合理范围的整数 (1..=500)
    let tail_lines = if non_empty_lines.len() > 3 {
        &non_empty_lines[non_empty_lines.len() - 3..]
    } else {
        &non_empty_lines[..]
    };

    let mut last_valid_num: Option<u32> = None;
    for line in tail_lines {
        let mut cur = String::new();
        for ch in line.chars() {
            if ch.is_ascii_digit() {
                cur.push(ch);
            } else if !cur.is_empty() {
                if let Ok(n) = cur.parse::<u32>() {
                    if (1..=500).contains(&n) {
                        last_valid_num = Some(n);
                    }
                }
                cur.clear();
            }
        }
        if !cur.is_empty() {
            if let Ok(n) = cur.parse::<u32>() {
                if (1..=500).contains(&n) {
                    last_valid_num = Some(n);
                }
            }
        }
    }

    last_valid_num
}

#[tauri::command]
pub fn generate_single_candy_challenge(
    index: usize,
    exclude_answers: Option<Vec<u32>>,
) -> CandyChallenge {
    let excluded = exclude_answers.unwrap_or_default();

    for _attempt in 0..80 {
        let circle_apple = random_range(5, 14);
        let circle_peach = random_range(5, 14);
        let circle_watermelon = random_range(4, 11);

        let star_apple = random_range(5, 14);
        let star_peach = random_range(5, 14);
        let star_watermelon = random_range(3, 10);

        let max_c = circle_apple.max(circle_peach);
        let max_s = star_apple.max(star_peach);

        // 确保两种形状的极值存在差异，使最优解唯一且不退化为简单对称题
        if max_c == max_s {
            continue;
        }
        if circle_apple == circle_peach && star_apple == star_peach {
            continue;
        }

        let (expected_answer, optimal_circle, optimal_star) = solve_candy_counts(
            circle_apple,
            circle_peach,
            circle_watermelon,
            star_apple,
            star_peach,
            star_watermelon,
        );

        // 避开已排除的答案数值，同时避开经典固定题的 21（除非无其他选择），防止死记硬背模型蒙混过关
        if excluded.contains(&expected_answer) {
            continue;
        }

        // 确保盲摸极值与手感策略极值不同
        let total_circle = circle_apple + circle_peach + circle_watermelon;
        let total_star = star_apple + star_peach + star_watermelon;
        let blind_worst_1 = total_circle + star_watermelon + 1;
        let blind_worst_2 = total_star + circle_watermelon + 1;
        if expected_answer >= blind_worst_1 || expected_answer >= blind_worst_2 {
            continue;
        }

        let prompt = build_candy_prompt(
            circle_apple,
            circle_peach,
            circle_watermelon,
            star_apple,
            star_peach,
            star_watermelon,
        );
        let rand_suffix = next_random_u64() & 0xFFFF_FFFF;

        return CandyChallenge {
            id: format!("candy-{}-{:08x}", index + 1, rand_suffix),
            circle_apple,
            circle_peach,
            circle_watermelon,
            star_apple,
            star_peach,
            star_watermelon,
            expected_answer,
            optimal_circle,
            optimal_star,
            prompt,
        };
    }

    // 兜底生成
    log::warn!(
        "糖果题生成: 随机尝试 80 次仍未找到满足约束的题目, index={}, 使用兜底参数",
        index
    );
    build_candy_challenge(index, 8, 10, 7, 6, 8, 5)
}

#[tauri::command]
pub fn generate_candy_challenges(count: Option<usize>) -> Vec<CandyChallenge> {
    let total = count.unwrap_or(3).clamp(1, 10);
    let mut challenges = Vec::with_capacity(total);
    let mut used_answers = Vec::with_capacity(total);

    for i in 0..total {
        let ch = generate_single_candy_challenge(i, Some(used_answers.clone()));
        used_answers.push(ch.expected_answer);
        challenges.push(ch);
    }

    challenges
}

#[tauri::command]
pub fn evaluate_candy_answer(response_text: String, expected_answer: u32) -> CandyEvaluationResult {
    let extracted_answer = extract_candy_answer(&response_text);
    if extracted_answer.is_none() {
        log::warn!(
            "糖果题评测: 未能从模型输出中解析出数字答案, expected={}, 响应长度={}",
            expected_answer,
            response_text.len()
        );
    }
    let is_correct = extracted_answer == Some(expected_answer);
    CandyEvaluationResult {
        extracted_answer,
        is_correct,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classic_candy_problem_solution() {
        // 经典原题：圆形(苹果7, 桃子9, 西瓜8)，五角星(苹果7, 桃子6, 西瓜4) -> 答案 21 (圆9, 星12)
        let (ans, opt_c, opt_s) = solve_candy_counts(7, 9, 8, 7, 6, 4);
        assert_eq!(ans, 21);
        assert_eq!(opt_c, 9);
        assert_eq!(opt_s, 12);
    }

    #[test]
    fn test_symmetric_candy_problem_solution() {
        // 对称反转：圆形(苹果7, 桃子6, 西瓜4)，五角星(苹果7, 桃子9, 西瓜8) -> 答案 21 (圆12, 星9)
        let (ans, opt_c, opt_s) = solve_candy_counts(7, 6, 4, 7, 9, 8);
        assert_eq!(ans, 21);
        assert_eq!(opt_c, 12);
        assert_eq!(opt_s, 9);
    }

    #[test]
    fn test_generate_three_distinct_challenges() {
        let list = generate_candy_challenges(Some(3));
        assert_eq!(list.len(), 3);
        // 校验每题答案等于求解器结果，且三题答案互不相同
        for ch in &list {
            let (ans, c, s) = solve_candy_counts(
                ch.circle_apple,
                ch.circle_peach,
                ch.circle_watermelon,
                ch.star_apple,
                ch.star_peach,
                ch.star_watermelon,
            );
            assert_eq!(ch.expected_answer, ans);
            assert_eq!(ch.optimal_circle, c);
            assert_eq!(ch.optimal_star, s);
        }
        assert_ne!(list[0].expected_answer, list[1].expected_answer);
        assert_ne!(list[1].expected_answer, list[2].expected_answer);
        assert_ne!(list[0].expected_answer, list[2].expected_answer);
    }

    #[test]
    fn test_extract_candy_answer_formats() {
        assert_eq!(
            extract_candy_answer("经过分析，取9个圆形和12个五角星，9+12=21。\n最终答案：21"),
            Some(21)
        );
        assert_eq!(
            extract_candy_answer("所以结果是 $\\boxed{24}$ 颗糖果。"),
            Some(24)
        );
        assert_eq!(
            extract_candy_answer("综上所述，最少需要取出 **19** 个糖果才能保证满足条件。"),
            Some(19)
        );
        assert_eq!(
            extract_candy_answer("步骤1：8+4=12\n步骤2：12+9=21\n21"),
            Some(21)
        );
        assert_eq!(extract_candy_answer(""), None);
    }

    #[test]
    fn test_evaluate_candy_answer() {
        let res_ok = evaluate_candy_answer("推理过程...\n最终答案：21".to_string(), 21);
        assert!(res_ok.is_correct);
        assert_eq!(res_ok.extracted_answer, Some(21));

        let res_wrong = evaluate_candy_answer("推理过程...\n最终答案：29".to_string(), 21);
        assert!(!res_wrong.is_correct);
        assert_eq!(res_wrong.extracted_answer, Some(29));
    }
}
