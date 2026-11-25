use std::collections::HashMap;
use std::future::{poll_fn, Future};
use std::pin::pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::task::Poll;

use tokio::sync::watch;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CancellationScope {
    Probe,
    Chat,
}

type EntryMap = HashMap<(CancellationScope, String), (u64, watch::Sender<bool>)>;

/// 统一请求取消注册表；使用 generation 编号防止旧请求 Drop 时误删同 ID 的新请求。
#[derive(Clone, Default)]
pub struct CancellationRegistry {
    entries: Arc<Mutex<EntryMap>>,
    next_gen: Arc<AtomicU64>,
}

impl CancellationRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(
        &self,
        scope: CancellationScope,
        request_id: impl Into<String>,
    ) -> CancellationGuard {
        let key = (scope, request_id.into());
        let generation = self.next_gen.fetch_add(1, Ordering::Relaxed) + 1;
        let (tx, rx) = watch::channel(false);

        let mut guard = self
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.insert(key.clone(), (generation, tx));

        CancellationGuard {
            registry: self.clone(),
            key,
            generation,
            rx,
        }
    }

    pub fn cancel(&self, scope: CancellationScope, request_id: &str) -> bool {
        let guard = self
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some((_, tx)) = guard.get(&(scope, request_id.to_string())) {
            let _ = tx.send_replace(true);
            true
        } else {
            false
        }
    }
}

pub struct CancellationGuard {
    registry: CancellationRegistry,
    key: (CancellationScope, String),
    generation: u64,
    rx: watch::Receiver<bool>,
}

impl CancellationGuard {
    pub fn token(&self) -> CancellationToken {
        CancellationToken {
            rx: Some(self.rx.clone()),
        }
    }
}

impl Drop for CancellationGuard {
    fn drop(&mut self) {
        let mut guard = self
            .registry
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some((current_gen, _)) = guard.get(&self.key) {
            if *current_gen == self.generation {
                guard.remove(&self.key);
            }
        }
    }
}

#[derive(Clone, Default)]
pub struct CancellationToken {
    rx: Option<watch::Receiver<bool>>,
}

impl CancellationToken {
    pub fn never() -> Self {
        Self { rx: None }
    }

    pub fn is_canceled(&self) -> bool {
        self.rx.as_ref().is_some_and(|rx| *rx.borrow())
    }

    pub fn ensure_running(&self) -> AppResult<()> {
        if self.is_canceled() {
            Err(AppError::Canceled("请求已取消".to_string()))
        } else {
            Ok(())
        }
    }

    /// 并发等待业务 future 与取消信号，触发取消时立即中止等待中的 IO。
    pub async fn run<F: Future>(&mut self, fut: F) -> AppResult<F::Output> {
        self.ensure_running()?;
        let Some(rx) = self.rx.as_mut() else {
            return Ok(fut.await);
        };

        let mut pinned_fut = pin!(fut);
        let mut cancel_fut = pin!(wait_until_canceled(rx));

        poll_fn(|cx| {
            if let Poll::Ready(output) = pinned_fut.as_mut().poll(cx) {
                return Poll::Ready(Ok(output));
            }
            if cancel_fut.as_mut().poll(cx).is_ready() {
                return Poll::Ready(Err(AppError::Canceled("请求已取消".to_string())));
            }
            Poll::Pending
        })
        .await
    }
}

async fn wait_until_canceled(rx: &mut watch::Receiver<bool>) {
    loop {
        if *rx.borrow_and_update() {
            return;
        }
        if rx.changed().await.is_err() {
            // 发送端被丢弃但未标记取消：保持挂起等待业务 future 自然完成
            std::future::pending::<()>().await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn test_scope_isolation_and_cancel() {
        let registry = CancellationRegistry::new();
        let probe_guard = registry.register(CancellationScope::Probe, "req-1");
        let chat_guard = registry.register(CancellationScope::Chat, "req-1");

        assert!(!probe_guard.token().is_canceled());
        assert!(!chat_guard.token().is_canceled());

        assert!(registry.cancel(CancellationScope::Probe, "req-1"));
        assert!(probe_guard.token().is_canceled());
        assert!(!chat_guard.token().is_canceled());
        assert!(probe_guard.token().ensure_running().is_err());
        assert!(chat_guard.token().ensure_running().is_ok());
    }

    #[test]
    fn test_drop_generation_prevents_removing_newer_request() {
        let registry = CancellationRegistry::new();
        let old_guard = registry.register(CancellationScope::Chat, "same-id");
        let new_guard = registry.register(CancellationScope::Chat, "same-id");

        drop(old_guard);
        assert!(registry.cancel(CancellationScope::Chat, "same-id"));
        assert!(new_guard.token().is_canceled());
    }

    #[test]
    fn test_run_aborts_pending_future_immediately() {
        let registry = CancellationRegistry::new();
        let guard = registry.register(CancellationScope::Probe, "abort-now");
        let mut token = guard.token();

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();

        let started = Instant::now();
        let res = runtime.block_on(async {
            let cancel_registry = registry.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(15)).await;
                cancel_registry.cancel(CancellationScope::Probe, "abort-now");
            });

            token.run(tokio::time::sleep(Duration::from_secs(5))).await
        });

        assert!(matches!(res, Err(AppError::Canceled(_))));
        assert!(started.elapsed() < Duration::from_millis(250));
    }

    #[test]
    fn test_never_token_runs_to_completion() {
        let mut token = CancellationToken::never();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        let out = runtime.block_on(token.run(async { 42 })).unwrap();
        assert_eq!(out, 42);
    }
}
