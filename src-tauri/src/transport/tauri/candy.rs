use tauri::State;

use crate::services::candy::{CandyChallenge, CandyEvaluationResult};
use crate::services::AppServices;

#[tauri::command]
pub fn generate_candy_challenges(
    services: State<'_, AppServices>,
    count: Option<usize>,
) -> Vec<CandyChallenge> {
    services.candy.generate_challenges(count)
}

#[tauri::command]
pub fn generate_single_candy_challenge(
    services: State<'_, AppServices>,
    index: usize,
    exclude_answers: Option<Vec<u32>>,
) -> CandyChallenge {
    services.candy.generate_single(index, exclude_answers)
}

#[tauri::command]
pub fn evaluate_candy_answer(
    services: State<'_, AppServices>,
    response_text: String,
    expected_answer: u32,
) -> CandyEvaluationResult {
    services
        .candy
        .evaluate(&response_text, expected_answer)
}
