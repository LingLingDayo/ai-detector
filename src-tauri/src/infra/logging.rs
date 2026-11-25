use std::cell::Cell;
use std::sync::{Arc, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

pub type LogSink = Arc<dyn Fn(LogEntry) + Send + Sync + 'static>;

static LOGGER: MemoryLogger = MemoryLogger;
static LOG_SINK: OnceLock<LogSink> = OnceLock::new();

thread_local! {
    // sink 回调期间置位；重入的日志调用直接丢弃，避免 log -> sink -> log 无限递归
    static EMITTING: Cell<bool> = const { Cell::new(false) };
}

#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub timestamp_ms: u64,
    pub level: String,
    pub target: String,
    pub message: String,
}

// RAII 复位标志，即使回调过程中发生 panic 也不会让重入保护永久卡住
struct ReentryGuard;

impl ReentryGuard {
    fn acquire() -> Option<Self> {
        EMITTING.with(|emitting| {
            if emitting.replace(true) {
                None
            } else {
                Some(ReentryGuard)
            }
        })
    }
}

impl Drop for ReentryGuard {
    fn drop(&mut self) {
        EMITTING.with(|emitting| emitting.set(false));
    }
}

pub struct MemoryLogger;

impl log::Log for MemoryLogger {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        metadata.level() <= log::max_level()
    }

    fn log(&self, record: &log::Record<'_>) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let _guard = match ReentryGuard::acquire() {
            Some(guard) => guard,
            None => return,
        };

        let entry = LogEntry {
            timestamp_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            level: record.level().as_str().to_lowercase(),
            target: record.target().to_string(),
            message: record.args().to_string(),
        };

        if let Some(sink) = LOG_SINK.get() {
            sink(entry);
        }
    }

    fn flush(&self) {}
}

pub fn init_with_sink<F>(sink: F)
where
    F: Fn(LogEntry) + Send + Sync + 'static,
{
    let _ = LOG_SINK.set(Arc::new(sink));

    // set_logger 全局只能成功一次；重复调用返回 Err，忽略即可，不能 panic
    if log::set_logger(&LOGGER).is_ok() {
        log::set_max_level(if cfg!(debug_assertions) {
            log::LevelFilter::Debug
        } else {
            log::LevelFilter::Info
        });
    }

    std::panic::set_hook(Box::new(|info| {
        log::error!(target: "panic", "{}", info);
    }));
}
