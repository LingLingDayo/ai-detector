use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::error::{AppError, AppResult};

use super::policy::FRAME_INTERVAL_MS;

#[derive(Default)]
pub struct CaptureRegistry {
    active: Mutex<Option<Arc<CaptureState>>>,
}

pub struct CaptureState {
    pub request_id: String,
    pub canceled: AtomicBool,
}

pub struct CaptureGuard<'a> {
    registry: &'a CaptureRegistry,
    pub state: Arc<CaptureState>,
}

impl CaptureRegistry {
    pub fn begin(&self, request_id: &str) -> AppResult<CaptureGuard<'_>> {
        if request_id.trim().is_empty() || request_id.len() > 128 {
            return Err(AppError::InvalidInput("GIF 采集请求标识无效".to_string()));
        }
        let mut active = self
            .active
            .lock()
            .map_err(|_| AppError::Platform("GIF 采集状态不可用".to_string()))?;
        if active.is_some() {
            return Err(AppError::Conflict("已有 GIF 采集正在进行".to_string()));
        }
        let state = Arc::new(CaptureState {
            request_id: request_id.to_string(),
            canceled: AtomicBool::new(false),
        });
        *active = Some(state.clone());
        Ok(CaptureGuard {
            registry: self,
            state,
        })
    }

    pub fn cancel(&self, request_id: &str) -> AppResult<()> {
        let active = self
            .active
            .lock()
            .map_err(|_| AppError::Platform("GIF 采集状态不可用".to_string()))?;
        if let Some(state) = active
            .as_ref()
            .filter(|state| state.request_id == request_id)
        {
            state.canceled.store(true, Ordering::Release);
        }
        Ok(())
    }
}

impl CaptureState {
    pub fn ensure_running(&self) -> AppResult<()> {
        if self.canceled.load(Ordering::Acquire) {
            Err(AppError::Canceled("GIF 采集已取消".to_string()))
        } else {
            Ok(())
        }
    }
}

impl Drop for CaptureGuard<'_> {
    fn drop(&mut self) {
        self.state.canceled.store(true, Ordering::Release);
        let mut active = self
            .registry
            .active
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if active
            .as_ref()
            .is_some_and(|state| Arc::ptr_eq(state, &self.state))
        {
            *active = None;
        }
    }
}

pub async fn wait_capture_result(
    receiver: &mut tokio::sync::mpsc::Receiver<AppResult<String>>,
    state: &CaptureState,
    deadline: Instant,
) -> AppResult<String> {
    loop {
        state.ensure_running()?;
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(AppError::Timeout("作品截图等待超时".to_string()));
        }
        let timeout = remaining.min(Duration::from_millis(FRAME_INTERVAL_MS));
        match tokio::time::timeout(timeout, receiver.recv()).await {
            Ok(Some(result)) => {
                state.ensure_running()?;
                if Instant::now() >= deadline {
                    return Err(AppError::Timeout("作品截图等待超时".to_string()));
                }
                return result;
            }
            Ok(None) => return Err(AppError::Platform("作品截图回调已中断".to_string())),
            Err(_) => continue,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capture_registry_rejects_concurrent_capture_and_releases_on_drop() {
        let registry = CaptureRegistry::default();
        let first = registry.begin("first").unwrap();
        assert!(registry.begin("second").is_err());
        let old_state = first.state.clone();
        drop(first);
        assert!(old_state.ensure_running().is_err());
        assert!(registry.begin("second").is_ok());
    }

    #[test]
    fn test_capture_registry_only_cancels_matching_request() {
        let registry = CaptureRegistry::default();
        let first = registry.begin("first").unwrap();
        registry.cancel("unrelated").unwrap();
        assert!(first.state.ensure_running().is_ok());
        registry.cancel("first").unwrap();
        assert!(first
            .state
            .ensure_running()
            .unwrap_err()
            .to_string()
            .contains("取消"));
        drop(first);
        assert!(registry
            .begin("first")
            .unwrap()
            .state
            .ensure_running()
            .is_ok());
    }

    #[test]
    fn test_capture_registry_rejects_empty_request_ids() {
        let registry = CaptureRegistry::default();
        assert!(registry.begin("").is_err());
        assert!(registry.begin("   ").is_err());
        assert!(registry.begin(&"x".repeat(129)).is_err());
        assert!(registry.begin("valid").is_ok());
    }

    #[test]
    fn test_capture_wait_delivers_ready_callback_immediately() {
        let state = CaptureState {
            request_id: "ready".to_string(),
            canceled: AtomicBool::new(false),
        };
        let (sender, mut receiver) = tokio::sync::mpsc::channel(1);
        sender.try_send(Ok("clipped-png".to_string())).unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        assert_eq!(
            runtime
                .block_on(wait_capture_result(
                    &mut receiver,
                    &state,
                    Instant::now() + Duration::from_millis(50)
                ))
                .unwrap(),
            "clipped-png"
        );
    }

    #[test]
    fn test_capture_wait_is_bounded_by_deadline() {
        let state = CaptureState {
            request_id: "timeout".to_string(),
            canceled: AtomicBool::new(false),
        };
        let (_sender, mut receiver) = tokio::sync::mpsc::channel(1);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        let started = Instant::now();
        let error = runtime
            .block_on(wait_capture_result(
                &mut receiver,
                &state,
                started + Duration::from_millis(30),
            ))
            .unwrap_err()
            .to_string();
        assert!(error.contains("超时"), "{error}");
        assert!(started.elapsed() >= Duration::from_millis(30));
        assert!(started.elapsed() < Duration::from_millis(500));
    }

    #[test]
    fn test_capture_wait_rejects_canceled_or_closed_callbacks() {
        let state = CaptureState {
            request_id: "cancel".to_string(),
            canceled: AtomicBool::new(true),
        };
        let (sender, mut receiver) = tokio::sync::mpsc::channel(1);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        assert!(runtime
            .block_on(wait_capture_result(
                &mut receiver,
                &state,
                Instant::now() + Duration::from_secs(2)
            ))
            .unwrap_err()
            .to_string()
            .contains("取消"));
        state.canceled.store(false, Ordering::Relaxed);
        drop(sender);
        assert!(runtime
            .block_on(wait_capture_result(
                &mut receiver,
                &state,
                Instant::now() + Duration::from_secs(2)
            ))
            .unwrap_err()
            .to_string()
            .contains("中断"));
    }

    #[test]
    fn test_capture_wait_observes_cancellation_while_com_callback_is_pending() {
        let state = Arc::new(CaptureState {
            request_id: "pending".to_string(),
            canceled: AtomicBool::new(false),
        });
        let (_sender, mut receiver) = tokio::sync::mpsc::channel(1);
        let cancel_state = state.clone();
        let cancel = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(10));
            cancel_state.canceled.store(true, Ordering::Release);
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        let started = Instant::now();
        let error = runtime
            .block_on(wait_capture_result(
                &mut receiver,
                &state,
                started + Duration::from_secs(2),
            ))
            .unwrap_err()
            .to_string();
        cancel.join().unwrap();
        assert!(error.contains("取消"), "{error}");
        assert!(started.elapsed() < Duration::from_millis(500));
    }
}
