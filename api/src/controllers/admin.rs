use crate::app_error::AppError;
use crate::entities::{articles, feeds, fetch_history, user_feeds};
use crate::storage::AppStorage;
use auth::AdminUserContext;
use axum::{
    extract::{Path, Query, State},
    routing::{get, post, put},
    Json, Router,
};
use glass::data::pagination::{Paginatable, PaginatedResponse, PaginationParams};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

pub fn routes() -> Router<Arc<AppStorage>> {
    Router::new()
        .route("/feeds", get(list_feeds))
        .route("/feeds/:id", put(update_feed))
        .route("/feeds/:id/fetch-history", get(list_feed_fetch_history))
        .route("/feeds/:id/fetch-now", post(fetch_feed_now))
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
    pub next_fetch_at: Option<chrono::DateTime<chrono::Utc>>,
    pub article_count: u64,
    pub fetch_interval_minutes: i32,
    pub enabled: bool,
}

/// List all feeds (admin view)
#[utoipa::path(
    get,
    path = "/admin/feeds",
    operation_id = "admin_list_feeds",
    responses(
        (status = 200, description = "List of all feeds", body = [AdminFeedResponse]),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
    ),
    security(("Bearer" = [])),
    tag = "admin"
)]
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
            next_fetch_at: last_fetched_at
                .map(|t| t + chrono::Duration::minutes(feed.fetch_interval_minutes as i64)),
            article_count,
            fetch_interval_minutes: feed.fetch_interval_minutes,
            enabled: feed.deactivated_at.is_none(),
        });
    }

    Ok(Json(result))
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct AdminUpdateFeedRequest {
    pub fetch_interval_minutes: Option<i32>,
    pub enabled: Option<bool>,
}

/// Update a feed's fetch interval and enabled/disabled state.
#[utoipa::path(
    put,
    path = "/admin/feeds/{id}",
    request_body = AdminUpdateFeedRequest,
    responses(
        (status = 200, description = "Feed updated", body = AdminFeedResponse),
        (status = 400, description = "Invalid request"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Feed not found"),
    ),
    security(("Bearer" = [])),
    tag = "admin"
)]
async fn update_feed(
    _admin: AdminUserContext<AppStorage>,
    State(state): State<Arc<AppStorage>>,
    Path(feed_id): Path<i32>,
    Json(req): Json<AdminUpdateFeedRequest>,
) -> Result<Json<AdminFeedResponse>, AppError> {
    let db = &state.db;

    let feed = feeds::Entity::find_by_id(feed_id)
        .one(db)
        .await?
        .ok_or_else(|| AppError::not_found("Feed not found"))?;

    let mut active: feeds::ActiveModel = feed.into();

    if let Some(interval) = req.fetch_interval_minutes {
        if interval < 1 {
            return Err(AppError::bad_request(
                "fetch_interval_minutes must be at least 1",
            ));
        }
        active.fetch_interval_minutes = Set(interval);
    }

    if let Some(enabled) = req.enabled {
        if enabled {
            active.deactivated_at = Set(None);
        } else {
            active.deactivated_at = Set(Some(chrono::Utc::now()));
        }
    }

    let updated = active.update(db).await?;

    let last_fetch_map = fetch_history::Model::last_fetch_times(db, &[updated.id]).await?;
    let last_fetched_at = last_fetch_map.get(&updated.id).copied();
    let article_count = articles::Model::unread_count(db, updated.id, None)
        .await
        .unwrap_or(0);

    Ok(Json(AdminFeedResponse {
        id: updated.id,
        url: updated.url,
        name: updated.name,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
        verified_at: updated.verified_at,
        last_fetched_at,
        next_fetch_at: last_fetched_at
            .map(|t| t + chrono::Duration::minutes(updated.fetch_interval_minutes as i64)),
        article_count,
        fetch_interval_minutes: updated.fetch_interval_minutes,
        enabled: updated.deactivated_at.is_none(),
    }))
}

/// List fetch history for a feed (admin view)
#[utoipa::path(
    get,
    path = "/admin/feeds/{id}/fetch-history",
    operation_id = "admin_list_feed_fetch_history",
    params(
        ("id" = i32, Path, description = "Feed ID"),
        PaginationParams,
    ),
    responses(
        (status = 200, description = "Fetch history", body = glass::data::pagination::PaginatedResponse<crate::controllers::feeds::FetchHistoryResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Feed not found"),
    ),
    security(("Bearer" = [])),
    tag = "admin"
)]
async fn list_feed_fetch_history(
    _admin: AdminUserContext<AppStorage>,
    State(state): State<Arc<AppStorage>>,
    Path(feed_id): Path<i32>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<PaginatedResponse<crate::controllers::feeds::FetchHistoryResponse>>, AppError> {
    let db = &state.db;
    // Verify feed exists
    feeds::Entity::find_by_id(feed_id)
        .one(db)
        .await?
        .ok_or_else(|| AppError::not_found("Feed not found"))?;

    let paginated = fetch_history::Entity::find()
        .filter(fetch_history::Column::FeedId.eq(feed_id))
        .order_by_desc(fetch_history::Column::CreatedAt)
        .fetch_paginated(db, &params)
        .await?
        .map(crate::controllers::feeds::FetchHistoryResponse::from_model);

    Ok(Json(paginated))
}

// ── Maintenance tasks ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
pub struct FetchNowResponse {
    pub message: String,
    pub task_id: String,
}

/// Enqueue an immediate one-off fetch for a specific feed (admin only).
#[utoipa::path(
    post,
    path = "/admin/feeds/{id}/fetch-now",
    operation_id = "admin_fetch_feed_now",
    params(
        ("id" = i32, Path, description = "Feed ID")
    ),
    responses(
        (status = 200, description = "Fetch task enqueued", body = FetchNowResponse),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Feed not found"),
    ),
    security(("Bearer" = [])),
    tag = "admin"
)]
async fn fetch_feed_now(
    _admin: AdminUserContext<AppStorage>,
    State(state): State<Arc<AppStorage>>,
    Path(feed_id): Path<i32>,
) -> Result<Json<FetchNowResponse>, AppError> {
    let db = &state.db;

    // Verify feed exists before enqueueing
    feeds::Entity::find_by_id(feed_id)
        .one(db)
        .await?
        .ok_or_else(|| AppError::not_found("Feed not found"))?;

    let task = state
        .tasks
        .inner()
        .enqueue(
            "feed_fetch_single".to_string(),
            serde_json::json!({ "feed_id": feed_id }),
        )
        .await
        .map_err(|e| AppError::internal_error(format!("Failed to enqueue fetch task: {e}")))?;

    Ok(Json(FetchNowResponse {
        message: format!("Fetch task enqueued for feed {feed_id}"),
        task_id: task.id,
    }))
}

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
