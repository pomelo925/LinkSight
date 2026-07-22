//! Cooperative cancellation for long-running network diagnostics.
//!
//! Each test kind has a generation counter + cancel flag. Starting a test
//! bumps the generation and clears the flag; `request` sets the flag for the
//! current generation. Callers poll [`is_cancelled`] between work units and
//! abort promptly when true.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancelKind {
    Speedtest,
    Connectivity,
    Scan,
    Traceroute,
}

impl CancelKind {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "speedtest" => Some(Self::Speedtest),
            "connectivity" | "iperf" => Some(Self::Connectivity),
            "scan" => Some(Self::Scan),
            "traceroute" => Some(Self::Traceroute),
            _ => None,
        }
    }
}

struct Slot {
    generation: AtomicU64,
    cancelled: AtomicBool,
}

impl Slot {
    const fn new() -> Self {
        Self {
            generation: AtomicU64::new(0),
            cancelled: AtomicBool::new(false),
        }
    }
}

static SPEEDTEST: Slot = Slot::new();
static CONNECTIVITY: Slot = Slot::new();
static SCAN: Slot = Slot::new();
static TRACEROUTE: Slot = Slot::new();

fn slot(kind: CancelKind) -> &'static Slot {
    match kind {
        CancelKind::Speedtest => &SPEEDTEST,
        CancelKind::Connectivity => &CONNECTIVITY,
        CancelKind::Scan => &SCAN,
        CancelKind::Traceroute => &TRACEROUTE,
    }
}

/// Begin a new run for `kind`. Returns a generation token the caller must
/// pass to [`is_cancelled`].
pub fn begin(kind: CancelKind) -> u64 {
    let s = slot(kind);
    let gen = s.generation.fetch_add(1, Ordering::SeqCst) + 1;
    s.cancelled.store(false, Ordering::SeqCst);
    gen
}

/// Request cancellation of the active run for `kind`.
pub fn request(kind: CancelKind) {
    slot(kind).cancelled.store(true, Ordering::SeqCst);
}

/// True when the run identified by `generation` has been cancelled.
pub fn is_cancelled(kind: CancelKind, generation: u64) -> bool {
    let s = slot(kind);
    s.cancelled.load(Ordering::SeqCst) && s.generation.load(Ordering::SeqCst) == generation
}

/// Error message used when a test aborts due to user cancel.
pub const CANCELLED_MSG: &str = "cancelled";

pub fn cancelled_error() -> crate::error::LinkSightError {
    crate::error::LinkSightError::Cancelled
}

pub fn ensure(kind: CancelKind, generation: u64) -> crate::error::Result<()> {
    if is_cancelled(kind, generation) {
        Err(cancelled_error())
    } else {
        Ok(())
    }
}

pub fn is_cancel_error(err: &crate::error::LinkSightError) -> bool {
    matches!(err, crate::error::LinkSightError::Cancelled)
        || matches!(
            err,
            crate::error::LinkSightError::CommandFailed(msg) if msg == CANCELLED_MSG
        )
}
