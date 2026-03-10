use crate::app_error::AppError;
use crate::entities::{articles, feeds, fetch_history, user_articles, user_feeds};
use crate::storage::AppStorage;
use auth::UserContext;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
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

pub fn routes() -> Router<Arc<AppStorage>> {
    Router::new()
        .route("/feeds", get(list_feeds))
        .route("/feeds", post(create_feed))
        .route("/feeds/:id/articles", get(list_articles))
        .route("/feeds/:id/read", put(mark_feed_read))
        .route("/feeds/:id/fetch-history", get(list_fetch_history))
        .route("/articles/:id/read", put(mark_article_read))
}

// ── Request / Response types ──────────────────────────────────────────────────

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
}

impl FeedResponse {
    fn from_model(
        m: feeds::Model,
        last_read_at: Option<chrono::DateTime<chrono::Utc>>,
        subscribed_at: chrono::DateTime<chrono::Utc>,
        last_fetched_at: Option<chrono::DateTime<chrono::Utc>>,
        unread_count: u64,
    ) -> Self {
        FeedResponse {
            id: m.id,
            url: m.url,
            name: m.name,
            created_at: m.created_at,
            updated_at: m.updated_at,
            verified_at: m.verified_at,
            last_read_at,
            subscribed_at,
            last_fetched_at,
            unread_count,
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
    fn from_model(m: fetch_history::Model) -> Self {
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
    /// When the current user read this article (None = unread)
    pub read_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl ArticleResponse {
    fn from_model(m: articles::Model, read_at: Option<chrono::DateTime<chrono::Utc>>) -> Self {
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
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MessageResponse {
    pub message: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ArticlesQuery {
    /// Page number (1-based)
    #[serde(default = "default_page")]
    pub page: u64,
    /// Items per page (default 20, max 100)
    #[serde(default = "default_per_page")]
    pub per_page: u64,
}

fn default_page() -> u64 {
    1
}
fn default_per_page() -> u64 {
    20
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ArticlesPage {
    pub items: Vec<ArticleResponse>,
    pub page: u64,
    pub per_page: u64,
    pub total: u64,
    pub has_next: bool,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

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
    let feed_ids: Vec<i32> = user_feed_rows.into_iter().map(|uf| uf.feed_id).collect();

    let last_fetch_map = fetch_history::Model::last_fetch_times(db, &feed_ids)
        .await
        .unwrap_or_default();

    let feed_list = feeds::Model::find_active_by_ids(db, feed_ids).await?;

    let responses: Vec<FeedResponse> = feed_list
        .into_iter()
        .map(|f| {
            let last_read_at = read_map.get(&f.id).copied().flatten();
            let subscribed_at = subscribed_at_map
                .get(&f.id)
                .copied()
                .unwrap_or_else(chrono::Utc::now);
            let last_fetched_at = last_fetch_map.get(&f.id).copied();
            let unread_count = unread_map.get(&f.id).copied().unwrap_or(0).max(0) as u64;
            FeedResponse::from_model(
                f,
                last_read_at,
                subscribed_at,
                last_fetched_at,
                unread_count,
            )
        })
        .collect();

    Ok(Json(responses))
}

/// Subscribe to a feed by URL (creates the feed if it doesn't exist yet)
#[utoipa::path(
    post,
    path = "/feeds",
    request_body = CreateFeedRequest,
    responses(
        (status = 201, description = "Subscribed to feed", body = FeedResponse),
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
) -> Result<(StatusCode, Json<FeedResponse>), AppError> {
    payload
        .validate()
        .map_err(|e| AppError::bad_request(e.to_string()))?;

    let db = &state.db;
    let user_id = user_ctx.user.id;
    let hash = url_hash(&payload.url);

    // Find or create the Feed record
    let feed = match feeds::Model::find_by_url_hash(db, &hash).await? {
        Some(existing) => existing,
        None => {
            feeds::Model::create(db, payload.url.clone(), hash, payload.name.clone(), user_id)
                .await?
        }
    };

    // Create UserFeed association if it doesn't exist yet
    if user_feeds::Model::find_subscription(db, user_id, feed.id)
        .await?
        .is_none()
    {
        user_feeds::Model::create(db, user_id, feed.id).await?;
    }

    Ok((
        StatusCode::CREATED,
        Json(FeedResponse::from_model(
            feed,
            None,
            chrono::Utc::now(),
            None,
            0,
        )),
    ))
}

/// List articles for a feed
#[utoipa::path(
    get,
    path = "/feeds/{id}/articles",
    params(
        ("id" = i32, Path, description = "Feed ID"),
        ("page" = Option<u64>, Query, description = "Page number (1-based, default 1)"),
        ("per_page" = Option<u64>, Query, description = "Items per page (default 20, max 100)"),
    ),
    responses(
        (status = 200, description = "List feed articles", body = ArticlesPage),
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
    Query(q): Query<ArticlesQuery>,
) -> Result<Json<ArticlesPage>, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    // Verify feed exists and is active
    let feed = feeds::Model::find_by_id(db, id)
        .await?
        .ok_or_else(|| AppError::not_found("Feed not found"))?;
    if feed.is_deactivated() {
        return Err(AppError::not_found("Feed not found"));
    }

    let per_page = q.per_page.min(100).max(1);
    let page = q.page.max(1);

    let (items, total) = articles::Model::list_for_feed(db, id, page, per_page).await?;
    let has_next = page * per_page < total;

    // Fetch read status for this page of articles
    let article_ids: Vec<i32> = items.iter().map(|a| a.id).collect();
    let read_map = user_articles::Model::read_map_for_user(db, user_id, article_ids).await?;

    Ok(Json(ArticlesPage {
        items: items
            .into_iter()
            .map(|a| {
                let read_at = read_map.get(&a.id).copied().flatten();
                ArticleResponse::from_model(a, read_at)
            })
            .collect(),
        page,
        per_page,
        total,
        has_next,
    }))
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

/// List fetch history for a feed (most recent 50 entries)
#[utoipa::path(
    get,
    path = "/feeds/{id}/fetch-history",
    params(
        ("id" = i32, Path, description = "Feed ID")
    ),
    responses(
        (status = 200, description = "Fetch history", body = [FetchHistoryResponse]),
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
) -> Result<Json<Vec<FetchHistoryResponse>>, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    // Only allow subscribers to view history
    user_feeds::Model::find_subscription(db, user_id, id)
        .await?
        .ok_or_else(|| AppError::not_found("Feed subscription not found"))?;

    let history = fetch_history::Model::list_for_feed(db, id, 50).await?;

    Ok(Json(
        history
            .into_iter()
            .map(FetchHistoryResponse::from_model)
            .collect(),
    ))
}
