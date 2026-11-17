use std::future::Future;
use std::time::Duration;

/// 保留同一个请求 future，在取消时将其丢弃，从而中止正在等待的网络操作。
pub async fn await_cancellable<T>(
    request: impl Future<Output = Result<T, String>>,
    is_canceled: impl Fn() -> bool,
) -> Result<T, String> {
    let mut request = std::pin::pin!(request);
    loop {
        if is_canceled() {
            return Err("请求已取消".to_string());
        }
        match tokio::time::timeout(Duration::from_millis(100), &mut request).await {
            Ok(result) => {
                return if is_canceled() {
                    Err("请求已取消".to_string())
                } else {
                    result
                };
            }
            Err(_) => continue,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .start_paused(true)
            .build()
            .unwrap()
    }

    #[test]
    fn cancellation_drops_pending_request() {
        struct PendingRequest(Arc<AtomicBool>);
        impl Drop for PendingRequest {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }
        runtime().block_on(async {
            let canceled = Arc::new(AtomicBool::new(false));
            let flag = canceled.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(250)).await;
                flag.store(true, Ordering::SeqCst);
            });
            let dropped = Arc::new(AtomicBool::new(false));
            let guard = PendingRequest(dropped.clone());
            let start = tokio::time::Instant::now();
            let result = await_cancellable(
                async move {
                    let _guard = guard;
                    std::future::pending::<Result<(), String>>().await
                },
                || canceled.load(Ordering::SeqCst),
            )
            .await;
            assert_eq!(result.unwrap_err(), "请求已取消");
            assert!(dropped.load(Ordering::SeqCst));
            assert!(start.elapsed() <= Duration::from_millis(400));
        });
    }

    #[test]
    fn polling_keeps_request_progress_and_result() {
        runtime().block_on(async {
            let result = await_cancellable(
                async {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                    Ok(42)
                },
                || false,
            )
            .await;
            assert_eq!(result.unwrap(), 42);
        });
    }

    #[test]
    fn cancellation_wins_when_request_finishes_in_same_poll() {
        runtime().block_on(async {
            let canceled = AtomicBool::new(false);
            let result = await_cancellable(
                async {
                    canceled.store(true, Ordering::SeqCst);
                    Ok(42)
                },
                || canceled.load(Ordering::SeqCst),
            )
            .await;
            assert_eq!(result.unwrap_err(), "请求已取消");
        });
    }
}
