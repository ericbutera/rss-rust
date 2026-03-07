use crate::storage::AppStorage;
use axum::{routing::get, Json, Router};
use glass::feature_flags;
use serde_json::json;
use std::sync::Arc;

pub fn routes() -> Router<Arc<AppStorage>> {
    Router::new()
        .nest("/api", auth::routes())
        .nest("/api/oauth", auth::oauth_routes())
        .nest("/api/admin/feature-flags", feature_flags::admin_routes())
        .nest("/api/feature-flags", feature_flags::public_routes())
        .route("/api/health", get(health))
        .route("/", get(root))
}

async fn root() -> Json<serde_json::Value> {
    Json(json!({ "service": "api", "status": "ok" }))
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "healthy" }))
}
