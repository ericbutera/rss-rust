use crate::app_error::AppError;
use crate::entities::{articles, feeds, fetch_history, user_feeds};
use crate::storage::AppStorage;
use auth::AdminUserContext;
use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use sea_orm::{EntityTrait, QueryOrder};
use serde::Serialize;
use std::sync::Arc;
use utoipa::ToSchema;

pub fn routes() -> Router<Arc<AppStorage>> {
    Router::new()
        .route("/feeds", get(list_feeds))
        .route("/feeds/:id/fetch-history", get(list_feed_fetch_history))
        .route("/tasks/fix-unread-drift", post(fix_unread_drift))
}

// ── Feeds ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminFeedResponse {
    pub id: i32,
    pub url: String,
    pub name: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub verified_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_fetched_at: Option<chrono::DateTime<chrono::Utc>>,
    pub article_count: u64,
}

async fn list_feeds(
    _admin: AdminUserContext<AppStorage>,
    State(state): State<Arc<AppStorage>>,
) -> Result<Json<Vec<AdminFeedResponse>>, AppError> {
    let db = &state.db;
    let all_feeds = feeds::Entity::find()
        .order_by_asc(feeds::Column::CreatedAt)
        .all(db)
        .await?;

    let feed_ids: Vec<i32> = all_feeds.iter().map(|f| f.id).collect();
    let last_fetch_map = fetch_history::Model::last_fetch_times(db, &feed_ids).await?;

    let mut result = Vec::with_capacity(all_feeds.len());
    for feed in all_feeds {
        let article_count = articles::Model::unread_count(db, feed.id, None)
            .await
            .unwrap_or(0);
        let last_fetched_at = last_fetch_map.get(&feed.id).copied();
        result.push(AdminFeedResponse {
            id: feed.id,
            url: feed.url,
            name: feed.name,
            created_at: feed.created_at,
            updated_at: feed.updated_at,
            verified_at: feed.verified_at,
            last_fetched_at,
            article_count,
        });
    }

    Ok(Json(result))
}

async fn list_feed_fetch_history(
    _admin: AdminUserContext<AppStorage>,
    State(state): State<Arc<AppStorage>>,
    Path(feed_id): Path<i32>,
) -> Result<Json<Vec<crate::controllers::feeds::FetchHistoryResponse>>, AppError> {
    let db = &state.db;
    // Verify feed exists
    feeds::Entity::find_by_id(feed_id)
        .one(db)
        .await?
        .ok_or_else(|| AppError::not_found("Feed not found"))?;

    let history = fetch_history::Model::list_for_feed(db, feed_id, 50).await?;

    let data = history
        .into_iter()
        .map(|h| crate::controllers::feeds::FetchHistoryResponse {
            id: h.id,
            feed_id: h.feed_id,
            status_code: h.status_code,
            error_message: h.error_message,
            content_length: h.content_length,
            article_count: h.article_count,
            fetched_at: h.created_at,
        })
        .collect();

    Ok(Json(data))
}

// ── Maintenance tasks ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
pub struct FixDriftResponse {
    /// Number of user_feed rows whose unread_count was recalculated
    pub rows_updated: u64,
    pub message: String,
}

/// Recalculate unread_count for all user_feed subscriptions from ground truth.
///
/// This corrects drift that can accumulate when articles are viewed after a bulk
/// mark-all-read, causing spurious decrements that undercount genuinely new articles.
#[utoipa::path(
    post,
    path = "/admin/tasks/fix-unread-drift",
    responses(
        (status = 200, description = "Drift corrected", body = FixDriftResponse),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
    ),
    security(("Bearer" = [])),
    tag = "admin"
)]
async fn fix_unread_drift(
    _admin: AdminUserContext<AppStorage>,
    State(state): State<Arc<AppStorage>>,
) -> Result<Json<FixDriftResponse>, AppError> {
    let rows_updated = user_feeds::Model::fix_unread_drift_for_all(&state.db).await?;
    Ok(Json(FixDriftResponse {
        rows_updated,
        message: format!(
            "Recalculated unread counts for {} subscriptions",
            rows_updated
        ),
    }))
}
