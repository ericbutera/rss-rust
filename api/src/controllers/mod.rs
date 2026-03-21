pub mod admin;
pub mod assets;
pub mod feeds;
pub mod folders;

use crate::storage::AppStorage;
use axum::{routing::get, Json, Router};
use kaleido::auth;
use kaleido::auth::AdminUserContext;
use kaleido::background_jobs;
use kaleido::glass::feature_flags;
use kaleido::glass::metrics_controller;
use serde_json::json;
use std::sync::Arc;

pub fn routes() -> Router<Arc<AppStorage>> {
    Router::new()
        .nest("/api", auth::routes())
        .nest("/api/oauth", auth::oauth_routes())
        .nest("/api/admin/feature-flags", feature_flags::admin_routes())
        .nest("/api/feature-flags", feature_flags::public_routes())
        .nest(
            "/api/admin/tasks",
            background_jobs::admin::admin_routes::<AppStorage, AdminUserContext<AppStorage>>(),
        )
        .nest("/api/admin/users", auth::admin_routes())
        .nest(
            "/api/admin/metrics",
            metrics_controller::admin_routes::<AppStorage>(),
        )
        .nest("/api", feeds::routes())
        .nest("/api", folders::routes())
        .nest("/api/admin", admin::routes())
        .route("/api/favicons/:filename", get(assets::get_favicon))
        .route("/api/health", get(health))
        .route("/", get(root))
}

async fn root() -> Json<serde_json::Value> {
    Json(json!({ "service": "api", "status": "ok" }))
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "healthy" }))
}
