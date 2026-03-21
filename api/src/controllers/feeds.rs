use crate::app_error::AppError;
use crate::entities::{articles, feeds, fetch_history, user_articles, user_feeds};
use crate::storage::AppStorage;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post, put},
    Json, Router,
};
use kaleido::auth::UserContext;
use kaleido::glass::data::pagination::{Paginatable, PaginatedResponse, PaginationParams};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use utoipa::ToSchema;
use validator::Validate;

fn url_hash(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    hex::encode(hasher.finalize())
}

/// Normalize a feed URL to a canonical form to prevent duplicate entries.
/// - Strips fragment (#...)
/// - Sorts query parameters alphabetically
/// - Preserves scheme, host, path
fn normalize_url(raw: &str) -> Result<String, AppError> {
    let mut parsed = url::Url::parse(raw).map_err(|_| AppError::bad_request("Invalid URL"))?;

    // Strip fragment — fragments are client-side only and irrelevant for feeds
    parsed.set_fragment(None);

    // Sort query parameters for a consistent representation
    let query_string = parsed.query().map(|q| q.to_string());
    if let Some(q) = query_string {
        let mut pairs: Vec<(String, String)> = url::form_urlencoded::parse(q.as_bytes())
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        pairs.sort();
        pairs.dedup();

        if pairs.is_empty() {
            parsed.set_query(None);
        } else {
            let new_query = url::form_urlencoded::Serializer::new(String::new())
                .extend_pairs(pairs.iter())
                .finish();
            parsed.set_query(Some(&new_query));
        }
    }

    Ok(parsed.to_string())
}

pub fn routes() -> Router<Arc<AppStorage>> {
    Router::new()
        .route("/feeds", get(list_feeds))
        .route("/feeds", post(create_feed))
        .route("/feeds/reorder", put(reorder_feeds))
        .route("/feeds/:id", delete(unsubscribe_feed))
        .route("/feeds/:id/name", put(rename_feed))
        .route("/feeds/:id/view", put(update_feed_view))
        .route("/feeds/:id/articles", get(list_articles))
        .route("/feeds/:id/read", put(mark_feed_read))
        .route("/feeds/:id/fetch-history", get(list_fetch_history))
        .route("/feeds/tasks/:task_id", get(get_task_status))
        .route("/articles/:id", get(get_article))
        .route("/articles/:id/read", put(mark_article_read))
        .route("/articles/:id/save", put(toggle_save_article))
}

#[derive(Debug, Clone, Deserialize, Serialize, Validate, ToSchema)]
pub struct CreateFeedRequest {
    #[validate(url(message = "Must be a valid URL"))]
    pub url: String,
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct FeedResponse {
    pub id: i32,
    pub url: String,
    /// Display name: user's override if set, otherwise the feed's own title.
    pub name: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub verified_at: Option<chrono::DateTime<chrono::Utc>>,
    /// When the user last marked all articles in this feed as read
    pub last_read_at: Option<chrono::DateTime<chrono::Utc>>,
    /// When the current user subscribed to this feed
    pub subscribed_at: chrono::DateTime<chrono::Utc>,
    /// When the feed was last fetched by the worker
    pub last_fetched_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Number of unread articles (articles created after last_read_at, or all if never read)
    pub unread_count: u64,
    /// User-defined sort order for drag-and-drop ordering
    pub sort_order: i32,
    /// API path to the feed's favicon (e.g. /api/favicons/feed_1.ico), or null if unavailable
    pub favicon_url: Option<String>,
    /// Article layout mode: list | cards | magazine
    pub view_mode: String,
    /// Folder this feed belongs to, or null
    pub folder_id: Option<i32>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateFeedViewRequest {
    /// Layout mode for this feed's articles. One of: list, cards, magazine.
    pub view_mode: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateFeedNameRequest {
    /// New display name. Pass `null` to clear the override and fall back to the feed's default name.
    pub name: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ReorderFeedItem {
    pub feed_id: i32,
    pub sort_order: i32,
}

impl FeedResponse {
    fn from_model(
        m: feeds::Model,
        last_read_at: Option<chrono::DateTime<chrono::Utc>>,
        subscribed_at: chrono::DateTime<chrono::Utc>,
        last_fetched_at: Option<chrono::DateTime<chrono::Utc>>,
        unread_count: u64,
        sort_order: i32,
        name_override: Option<String>,
        view_mode: String,
        folder_id: Option<i32>,
    ) -> Self {
        FeedResponse {
            id: m.id,
            url: m.url,
            name: name_override.or(m.name),
            created_at: m.created_at,
            updated_at: m.updated_at,
            verified_at: m.verified_at,
            last_read_at,
            subscribed_at,
            last_fetched_at,
            unread_count,
            sort_order,
            favicon_url: m.favicon_url,
            view_mode,
            folder_id,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct FetchHistoryResponse {
    pub id: i32,
    pub feed_id: i32,
    pub status_code: Option<i32>,
    pub error_message: Option<String>,
    pub content_length: Option<i64>,
    pub article_count: Option<i32>,
    pub fetched_at: chrono::DateTime<chrono::Utc>,
}

impl FetchHistoryResponse {
    pub fn from_model(m: fetch_history::Model) -> Self {
        FetchHistoryResponse {
            id: m.id,
            feed_id: m.feed_id,
            status_code: m.status_code,
            error_message: m.error_message,
            content_length: m.content_length,
            article_count: m.article_count,
            fetched_at: m.created_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ArticleResponse {
    pub id: i32,
    pub feed_id: i32,
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub preview: Option<String>,
    pub content: Option<String>,
    pub guid: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub read_at: Option<chrono::DateTime<chrono::Utc>>,
    pub saved_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl ArticleResponse {
    pub fn from_model(
        m: articles::Model,
        read_at: Option<chrono::DateTime<chrono::Utc>>,
        saved_at: Option<chrono::DateTime<chrono::Utc>>,
    ) -> Self {
        ArticleResponse {
            id: m.id,
            feed_id: m.feed_id,
            url: m.url,
            title: m.title,
            description: m.description,
            image_url: m.image_url,
            preview: m.preview,
            content: m.content,
            guid: m.guid,
            created_at: m.created_at,
            updated_at: m.updated_at,
            read_at,
            saved_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MessageResponse {
    pub message: String,
}

/// Response returned when a new feed subscription is created.
#[derive(Debug, Serialize, ToSchema)]
pub struct CreateFeedResponse {
    pub feed: FeedResponse,
    /// Background task ID for the feed verification job.
    /// Poll `GET /feeds/tasks/{task_id}` to track verification progress.
    /// `None` when subscribing to an already-verified feed.
    pub task_id: Option<String>,
}

/// Status of a background task (e.g. feed verification).
#[derive(Debug, Serialize, ToSchema)]
pub struct TaskStatusResponse {
    pub id: String,
    /// One of: pending, processing, completed, failed
    pub status: String,
    pub error: Option<String>,
    pub attempts: i32,
    pub max_attempts: i32,
}

/// List the current user's subscribed feeds
#[utoipa::path(
    get,
    path = "/feeds",
    responses(
        (status = 200, description = "List user feeds", body = [FeedResponse]),
        (status = 401, description = "Unauthorized"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn list_feeds(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
) -> Result<Json<Vec<FeedResponse>>, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    let user_feed_rows = user_feeds::Model::for_user(db, user_id).await?;

    let read_map: HashMap<i32, Option<chrono::DateTime<chrono::Utc>>> = user_feed_rows
        .iter()
        .map(|uf| (uf.feed_id, uf.all_articles_read_at))
        .collect();
    let subscribed_at_map: HashMap<i32, chrono::DateTime<chrono::Utc>> = user_feed_rows
        .iter()
        .map(|uf| (uf.feed_id, uf.created_at))
        .collect();
    let unread_map: HashMap<i32, i32> = user_feed_rows
        .iter()
        .map(|uf| (uf.feed_id, uf.unread_count))
        .collect();
    let sort_order_map: HashMap<i32, i32> = user_feed_rows
        .iter()
        .map(|uf| (uf.feed_id, uf.sort_order))
        .collect();
    let name_override_map: HashMap<i32, Option<String>> = user_feed_rows
        .iter()
        .map(|uf| (uf.feed_id, uf.name_override.clone()))
        .collect();
    let view_mode_map: HashMap<i32, String> = user_feed_rows
        .iter()
        .map(|uf| (uf.feed_id, uf.view_mode.clone()))
        .collect();
    let folder_id_map: HashMap<i32, Option<i32>> = user_feed_rows
        .iter()
        .map(|uf| (uf.feed_id, uf.folder_id))
        .collect();
    let feed_ids: Vec<i32> = user_feed_rows.into_iter().map(|uf| uf.feed_id).collect();

    let last_fetch_map = fetch_history::Model::last_fetch_times(db, &feed_ids)
        .await
        .unwrap_or_default();

    let feed_list = feeds::Model::find_active_by_ids(db, feed_ids).await?;

    let mut responses: Vec<FeedResponse> = feed_list
        .into_iter()
        .map(|f| {
            let last_read_at = read_map.get(&f.id).copied().flatten();
            let subscribed_at = subscribed_at_map
                .get(&f.id)
                .copied()
                .unwrap_or_else(chrono::Utc::now);
            let last_fetched_at = last_fetch_map.get(&f.id).copied();
            let unread_count = unread_map.get(&f.id).copied().unwrap_or(0).max(0) as u64;
            let sort_order = sort_order_map.get(&f.id).copied().unwrap_or(0);
            let name_override = name_override_map.get(&f.id).cloned().flatten();
            let view_mode = view_mode_map
                .get(&f.id)
                .cloned()
                .unwrap_or_else(|| "list".to_string());
            let folder_id = folder_id_map.get(&f.id).copied().flatten();
            FeedResponse::from_model(
                f,
                last_read_at,
                subscribed_at,
                last_fetched_at,
                unread_count,
                sort_order,
                name_override,
                view_mode,
                folder_id,
            )
        })
        .collect();
    responses.sort_by_key(|r| r.sort_order);

    Ok(Json(responses))
}

/// Subscribe to a feed by URL (creates the feed if it doesn't exist yet)
#[utoipa::path(
    post,
    path = "/feeds",
    request_body = CreateFeedRequest,
    responses(
        (status = 201, description = "Subscribed to feed", body = CreateFeedResponse),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Unauthorized"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn create_feed(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Json(payload): Json<CreateFeedRequest>,
) -> Result<(StatusCode, Json<CreateFeedResponse>), AppError> {
    payload
        .validate()
        .map_err(|e| AppError::bad_request(e.to_string()))?;

    let db = &state.db;
    let user_id = user_ctx.user.id;

    // Normalize the URL before hashing to prevent duplicate entries from
    // superficially different URLs (sorted query params, no fragment).
    let normalized_url = normalize_url(&payload.url)?;
    let hash = url_hash(&normalized_url);

    // Find or create the Feed record
    let (feed, is_new) = match feeds::Model::find_by_url_hash(db, &hash).await? {
        Some(existing) => (existing, false),
        None => {
            let created = feeds::Model::create(
                db,
                normalized_url.clone(),
                hash,
                payload.name.clone(),
                user_id,
            )
            .await?;
            (created, true)
        }
    };

    // Create UserFeed association if it doesn't exist yet
    if user_feeds::Model::find_subscription(db, user_id, feed.id)
        .await?
        .is_none()
    {
        user_feeds::Model::create(db, user_id, feed.id).await?;
    }

    // Enqueue a verification task for new, unverified feeds
    let task_id = if is_new || feed.verified_at.is_none() {
        state
            .tasks
            .inner()
            .enqueue(
                "feed_verifier".to_string(),
                serde_json::json!({ "feed_id": feed.id }),
            )
            .await
            .map(|r| Some(r.id))
            .unwrap_or_else(|e| {
                tracing::warn!(feed_id = feed.id, "failed to enqueue feed_verifier: {e:?}");
                None
            })
    } else {
        None
    };

    Ok((
        StatusCode::CREATED,
        Json(CreateFeedResponse {
            feed: FeedResponse::from_model(
                feed,
                None,
                chrono::Utc::now(),
                None,
                0,
                0,
                None,
                "list".to_string(),
                None,
            ),
            task_id,
        }),
    ))
}

/// Unsubscribe the current user from a feed
#[utoipa::path(
    delete,
    path = "/feeds/{id}",
    params(
        ("id" = i32, Path, description = "Feed ID")
    ),
    responses(
        (status = 204, description = "Unsubscribed"),
        (status = 401, description = "Unauthorized"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn unsubscribe_feed(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Path(id): Path<i32>,
) -> Result<StatusCode, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;
    user_feeds::Model::delete(db, user_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Set a custom display name for a feed subscription (persisted on user_feeds)
#[utoipa::path(
    put,
    path = "/feeds/{id}/name",
    params(
        ("id" = i32, Path, description = "Feed ID")
    ),
    request_body = UpdateFeedNameRequest,
    responses(
        (status = 200, description = "Name updated", body = FeedResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Feed not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn rename_feed(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdateFeedNameRequest>,
) -> Result<Json<FeedResponse>, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    let uf = user_feeds::Model::set_name_override(db, user_id, id, payload.name)
        .await?
        .ok_or_else(|| AppError::not_found("Feed subscription not found"))?;

    let feed = feeds::Model::find_by_id(db, id)
        .await?
        .ok_or_else(|| AppError::not_found("Feed not found"))?;

    Ok(Json(FeedResponse::from_model(
        feed,
        uf.all_articles_read_at,
        uf.created_at,
        None,
        uf.unread_count.max(0) as u64,
        uf.sort_order,
        uf.name_override,
        uf.view_mode,
        uf.folder_id,
    )))
}

/// Set the article layout mode for a feed subscription
#[utoipa::path(
    put,
    path = "/feeds/{id}/view",
    params(
        ("id" = i32, Path, description = "Feed ID")
    ),
    request_body = UpdateFeedViewRequest,
    responses(
        (status = 200, description = "View mode updated", body = FeedResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Feed not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn update_feed_view(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdateFeedViewRequest>,
) -> Result<Json<FeedResponse>, AppError> {
    let valid_modes = ["list", "cards", "magazine"];
    if !valid_modes.contains(&payload.view_mode.as_str()) {
        return Err(AppError::bad_request(format!(
            "view_mode must be one of: {}",
            valid_modes.join(", ")
        )));
    }

    let db = &state.db;
    let user_id = user_ctx.user.id;

    let uf = user_feeds::Model::set_view_mode(db, user_id, id, &payload.view_mode)
        .await?
        .ok_or_else(|| AppError::not_found("Feed subscription not found"))?;

    let feed = feeds::Model::find_by_id(db, id)
        .await?
        .ok_or_else(|| AppError::not_found("Feed not found"))?;

    Ok(Json(FeedResponse::from_model(
        feed,
        uf.all_articles_read_at,
        uf.created_at,
        None,
        uf.unread_count.max(0) as u64,
        uf.sort_order,
        uf.name_override,
        uf.view_mode,
        uf.folder_id,
    )))
}

/// Get the status of a background task (e.g. feed verification)
#[utoipa::path(
    get,
    path = "/feeds/tasks/{task_id}",
    params(
        ("task_id" = String, Path, description = "Background task ID")
    ),
    responses(
        (status = 200, description = "Task status", body = TaskStatusResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Task not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn get_task_status(
    _user: UserContext<AppStorage>,
    State(state): State<Arc<AppStorage>>,
    Path(task_id): Path<String>,
) -> Result<Json<TaskStatusResponse>, AppError> {
    let task = state
        .tasks
        .inner()
        .get_task(&task_id)
        .await
        .map_err(|_| AppError::internal_error("Failed to query task status"))?
        .ok_or_else(|| AppError::not_found("Task not found"))?;

    Ok(Json(TaskStatusResponse {
        id: task.id,
        status: task.status.as_str().to_string(),
        error: task.error,
        attempts: task.attempts,
        max_attempts: task.max_attempts,
    }))
}

#[derive(Debug, Deserialize)]
pub struct ListArticlesParams {
    #[serde(flatten)]
    pub pagination: PaginationParams,
    #[serde(default)]
    pub only_saved: bool,
}

/// List articles for a feed
#[utoipa::path(
    get,
    path = "/feeds/{id}/articles",
    params(
        ("id" = i32, Path, description = "Feed ID"),
        PaginationParams,
    ),
    responses(
        (status = 200, description = "List feed articles", body = PaginatedResponse<ArticleResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Feed not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn list_articles(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Path(id): Path<i32>,
    Query(params): Query<ListArticlesParams>,
) -> Result<Json<PaginatedResponse<ArticleResponse>>, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    // TODO: move to feed model method like `articles_for_user` that handles the user_articles join and state mapping internally
    // Verify feed exists and is active
    let feed = feeds::Model::find_by_id(db, id)
        .await?
        .ok_or_else(|| AppError::not_found("Feed not found"))?;
    if feed.is_deactivated() {
        return Err(AppError::not_found("Feed not found"));
    }

    let paginated = articles::Entity::find()
        .filter(articles::Column::FeedId.eq(id))
        .order_by_desc(articles::Column::CreatedAt)
        .fetch_paginated(db, &params.pagination)
        .await?;

    let article_ids: Vec<i32> = paginated.data.iter().map(|a| a.id).collect();
    let state_map = user_articles::Model::state_map_for_user(db, user_id, article_ids).await?;

    let mapped = paginated.map(|a| {
        let (read_at, saved_at) = state_map.get(&a.id).copied().unwrap_or((None, None));
        ArticleResponse::from_model(a, read_at, saved_at)
    });

    if params.only_saved {
        let saved: Vec<ArticleResponse> = mapped
            .data
            .into_iter()
            .filter(|a| a.saved_at.is_some())
            .collect();
        Ok(Json(PaginatedResponse {
            data: saved,
            metadata: mapped.metadata,
        }))
    } else {
        Ok(Json(mapped))
    }
}

/// Mark all articles in a feed as read for the current user
#[utoipa::path(
    put,
    path = "/feeds/{id}/read",
    params(
        ("id" = i32, Path, description = "Feed ID")
    ),
    responses(
        (status = 200, description = "Feed marked as read", body = MessageResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Subscription not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn mark_feed_read(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Path(id): Path<i32>,
) -> Result<Json<MessageResponse>, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    user_feeds::Model::mark_read(db, user_id, id)
        .await?
        .ok_or_else(|| AppError::not_found("Feed subscription not found"))?;

    Ok(Json(MessageResponse {
        message: "Feed marked as read".to_string(),
    }))
}

/// Get a single article by ID
#[utoipa::path(
    get,
    path = "/articles/{id}",
    params(
        ("id" = i32, Path, description = "Article ID")
    ),
    responses(
        (status = 200, description = "Article", body = ArticleResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Article not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn get_article(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Path(id): Path<i32>,
) -> Result<Json<ArticleResponse>, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    let article = articles::Model::find_by_id(db, id)
        .await?
        .ok_or_else(|| AppError::not_found("Article not found"))?;

    let state_map = user_articles::Model::state_map_for_user(db, user_id, vec![id]).await?;
    let (read_at, saved_at) = state_map.get(&id).copied().unwrap_or((None, None));

    Ok(Json(ArticleResponse::from_model(
        article, read_at, saved_at,
    )))
}

/// Mark an article as read for the current user
#[utoipa::path(
    put,
    path = "/articles/{id}/read",
    params(
        ("id" = i32, Path, description = "Article ID")
    ),
    responses(
        (status = 200, description = "Article marked as read", body = MessageResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Article not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn mark_article_read(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Path(id): Path<i32>,
) -> Result<Json<MessageResponse>, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    // Verify article exists
    let article = articles::Model::find_by_id(db, id)
        .await?
        .ok_or_else(|| AppError::not_found("Article not found"))?;

    let newly_read = user_articles::Model::mark_read(db, user_id, id).await?;
    if newly_read {
        // Only decrement if the article is not already covered by a bulk mark-all-read.
        // When mark_feed_read is called it zeros unread_count and sets all_articles_read_at
        // but does NOT create user_articles rows. If the user later views an old article
        // (created <= all_articles_read_at), mark_read returns true (no row existed), but
        // the article was already accounted for in the zero-out — so no decrement is owed.
        let should_decrement =
            match user_feeds::Model::find_subscription(db, user_id, article.feed_id).await? {
                Some(sub) => sub
                    .all_articles_read_at
                    .map_or(true, |read_at| article.created_at > read_at),
                None => false,
            };
        if should_decrement {
            user_feeds::Model::decrement_unread(db, user_id, article.feed_id).await?;
        }
    }

    Ok(Json(MessageResponse {
        message: "Article marked as read".to_string(),
    }))
}

/// List fetch history for a feed
#[utoipa::path(
    get,
    path = "/feeds/{id}/fetch-history",
    params(
        ("id" = i32, Path, description = "Feed ID"),
        PaginationParams,
    ),
    responses(
        (status = 200, description = "Fetch history", body = PaginatedResponse<FetchHistoryResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Feed not found or not subscribed"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn list_fetch_history(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Path(id): Path<i32>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<PaginatedResponse<FetchHistoryResponse>>, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    // Only allow subscribers to view history
    user_feeds::Model::find_subscription(db, user_id, id)
        .await?
        .ok_or_else(|| AppError::not_found("Feed subscription not found"))?;

    let paginated = fetch_history::Entity::find()
        .filter(fetch_history::Column::FeedId.eq(id))
        .order_by_desc(fetch_history::Column::CreatedAt)
        .fetch_paginated(db, &params)
        .await?
        .map(FetchHistoryResponse::from_model);

    Ok(Json(paginated))
}

/// Update sort order for the current user's feed subscriptions
#[utoipa::path(
    put,
    path = "/feeds/reorder",
    request_body = Vec<ReorderFeedItem>,
    responses(
        (status = 204, description = "Sort order updated"),
        (status = 401, description = "Unauthorized"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn reorder_feeds(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Json(items): Json<Vec<ReorderFeedItem>>,
) -> Result<StatusCode, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    for item in items {
        if let Some(row) = user_feeds::Model::find_subscription(db, user_id, item.feed_id).await? {
            let mut active: user_feeds::ActiveModel = row.into();
            active.sort_order = Set(item.sort_order);
            active.update(db).await?;
        }
    }

    Ok(StatusCode::NO_CONTENT)
}

/// Toggle saved state for an article (save if unsaved, unsave if saved)
#[utoipa::path(
    put,
    path = "/articles/{id}/save",
    params(
        ("id" = i32, Path, description = "Article ID")
    ),
    responses(
        (status = 200, description = "Saved state toggled", body = MessageResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Article not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn toggle_save_article(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Path(id): Path<i32>,
) -> Result<Json<MessageResponse>, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    articles::Model::find_by_id(db, id)
        .await?
        .ok_or_else(|| AppError::not_found("Article not found"))?;

    let saved_at = user_articles::Model::toggle_save(db, user_id, id).await?;
    let message = if saved_at.is_some() {
        "Article saved"
    } else {
        "Article unsaved"
    };

    Ok(Json(MessageResponse {
        message: message.to_string(),
    }))
}
