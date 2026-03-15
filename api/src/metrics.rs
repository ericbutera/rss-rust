// Shared auth + HTTP metrics live in kaleido::glass::api_metrics.
// This module is a thin wrapper that initialises the shared registry with the
// rss_api namespace.  There are no RSS-specific counters at present.

pub use kaleido::glass::api_metrics::{metrics_middleware, metrics_route};

/// Initialize all API metrics.  Must be called once at startup.
/// Exposed as async to match the call-site in main.rs.
pub async fn init_metrics() {
    kaleido::glass::api_metrics::init_api_metrics("rss_api");
}
