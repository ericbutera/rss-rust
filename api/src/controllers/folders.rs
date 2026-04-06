use crate::app_error::AppError;
use crate::entities::{articles, feed_folders, feeds, user_articles, user_feeds};
use crate::extractors::folder::FolderContext;
use crate::storage::AppStorage;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post, put},
    Json, Router,
};
use kaleido::auth::UserContext;
use kaleido::glass::data::pagination::{Paginatable, PaginatedResponse, PaginationParams};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

use super::feeds::ArticleResponse;

pub fn routes() -> Router<Arc<AppStorage>> {
    Router::new()
        .route("/folders", get(list_folders))
        .route("/folders", post(create_folder))
        .route("/folders/:id", delete(delete_folder))
        .route("/folders/:id/name", put(rename_folder))
        .route("/folders/:id/view", put(update_folder_view))
        .route("/folders/:id/articles", get(list_folder_articles))
        .route("/feeds/:id/folder", put(assign_feed_to_folder))
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct FolderResponse {
    pub id: i32,
    pub name: String,
    pub sort_order: i32,
    /// Total unread article count across all feeds in this folder
    pub unread_count: u64,
    pub view_mode: String,
    /// Whether to show only unread articles by default
    pub only_unread: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateFolderRequest {
    pub name: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct RenameFolderRequest {
    pub name: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateFolderViewRequest {
    pub view_mode: String,
    /// Whether to show only unread articles by default. Omit to leave unchanged.
    pub only_unread: Option<bool>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct AssignFolderRequest {
    /// Folder ID to assign, or null to remove from any folder
    pub folder_id: Option<i32>,
}

/// List all folders for the current user
#[utoipa::path(
    get,
    path = "/folders",
    responses(
        (status = 200, description = "List folders", body = [FolderResponse]),
        (status = 401, description = "Unauthorized"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn list_folders(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
) -> Result<Json<Vec<FolderResponse>>, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    let folders = feed_folders::Model::for_user(db, user_id).await?;

    let responses = folders
        .into_iter()
        .map(|f| FolderResponse {
            id: f.id,
            name: f.name,
            sort_order: f.sort_order,
            // Unread counts are computed client-side instead of here.
            unread_count: 0,
            view_mode: f.view_mode,
            only_unread: f.only_unread,
            created_at: f.created_at,
            updated_at: f.updated_at,
        })
        .collect();

    Ok(Json(responses))
}

/// Create a new folder
#[utoipa::path(
    post,
    path = "/folders",
    request_body = CreateFolderRequest,
    responses(
        (status = 201, description = "Folder created", body = FolderResponse),
        (status = 401, description = "Unauthorized"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn create_folder(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Json(payload): Json<CreateFolderRequest>,
) -> Result<(StatusCode, Json<FolderResponse>), AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    let folder = feed_folders::Model::create(db, user_id, payload.name).await?;

    Ok((
        StatusCode::CREATED,
        Json(FolderResponse {
            id: folder.id,
            name: folder.name,
            sort_order: folder.sort_order,
            unread_count: 0,
            view_mode: folder.view_mode,
            only_unread: folder.only_unread,
            created_at: folder.created_at,
            updated_at: folder.updated_at,
        }),
    ))
}

/// Delete a folder (feeds in the folder become unassigned)
#[utoipa::path(
    delete,
    path = "/folders/{id}",
    params(
        ("id" = i32, Path, description = "Folder ID")
    ),
    responses(
        (status = 204, description = "Folder deleted"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Folder not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn delete_folder(
    State(state): State<Arc<AppStorage>>,
    folder_ctx: FolderContext,
) -> Result<StatusCode, AppError> {
    let db = &state.db;
    let id = folder_ctx.folder.id;
    let user_id = folder_ctx.user_id;

    user_feeds::Entity::update_many()
        .col_expr(
            user_feeds::Column::FolderId,
            sea_orm::sea_query::Expr::value(sea_orm::Value::Int(None)),
        )
        .filter(user_feeds::Column::UserId.eq(user_id))
        .filter(user_feeds::Column::FolderId.eq(id))
        .exec(db)
        .await?;

    feed_folders::Model::delete(db, id, user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Rename a folder
#[utoipa::path(
    put,
    path = "/folders/{id}/name",
    params(
        ("id" = i32, Path, description = "Folder ID")
    ),
    request_body = RenameFolderRequest,
    responses(
        (status = 200, description = "Folder renamed", body = FolderResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Folder not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn rename_folder(
    State(state): State<Arc<AppStorage>>,
    folder_ctx: FolderContext,
    Json(payload): Json<RenameFolderRequest>,
) -> Result<Json<FolderResponse>, AppError> {
    let db = &state.db;
    let id = folder_ctx.folder.id;
    let user_id = folder_ctx.user_id;

    let folder = feed_folders::Model::rename(db, id, user_id, payload.name)
        .await?
        .ok_or_else(|| AppError::not_found("Folder not found"))?;

    Ok(Json(FolderResponse {
        id: folder.id,
        name: folder.name,
        sort_order: folder.sort_order,
        unread_count: 0,
        view_mode: folder.view_mode,
        only_unread: folder.only_unread,
        created_at: folder.created_at,
        updated_at: folder.updated_at,
    }))
}

/// Set the article layout mode for a folder
#[utoipa::path(
    put,
    path = "/folders/{id}/view",
    params(
        ("id" = i32, Path, description = "Folder ID")
    ),
    request_body = UpdateFolderViewRequest,
    responses(
        (status = 200, description = "Folder view mode updated", body = FolderResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Folder not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn update_folder_view(
    State(state): State<Arc<AppStorage>>,
    folder_ctx: FolderContext,
    Json(payload): Json<UpdateFolderViewRequest>,
) -> Result<Json<FolderResponse>, AppError> {
    let valid_modes = ["list", "cards", "magazine"];
    if !valid_modes.contains(&payload.view_mode.as_str()) {
        return Err(AppError::bad_request(format!(
            "view_mode must be one of: {}",
            valid_modes.join(", ")
        )));
    }

    let db = &state.db;
    let id = folder_ctx.folder.id;
    let user_id = folder_ctx.user_id;

    let folder = feed_folders::Model::set_view_mode(db, id, user_id, &payload.view_mode)
        .await?
        .ok_or_else(|| AppError::not_found("Folder not found"))?;

    // Optionally persist the only_unread preference in the same request
    let folder = if let Some(only_unread) = payload.only_unread {
        feed_folders::Model::set_only_unread(db, id, user_id, only_unread)
            .await?
            .ok_or_else(|| AppError::not_found("Folder not found"))?
    } else {
        folder
    };

    Ok(Json(FolderResponse {
        id: folder.id,
        name: folder.name,
        sort_order: folder.sort_order,
        unread_count: 0,
        view_mode: folder.view_mode,
        only_unread: folder.only_unread,
        created_at: folder.created_at,
        updated_at: folder.updated_at,
    }))
}

/// Assign (or unassign) a feed to a folder
#[utoipa::path(
    put,
    path = "/feeds/{id}/folder",
    params(
        ("id" = i32, Path, description = "Feed ID")
    ),
    request_body = AssignFolderRequest,
    responses(
        (status = 200, description = "Feed folder updated"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Feed subscription not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn assign_feed_to_folder(
    State(state): State<Arc<AppStorage>>,
    user_ctx: UserContext<AppStorage>,
    Path(id): Path<i32>,
    Json(payload): Json<AssignFolderRequest>,
) -> Result<StatusCode, AppError> {
    let db = &state.db;
    let user_id = user_ctx.user.id;

    // Verify the folder belongs to this user (if assigning)
    if let Some(folder_id) = payload.folder_id {
        feed_folders::Model::find_by_id_and_user(db, folder_id, user_id)
            .await?
            .ok_or_else(|| AppError::not_found("Folder not found"))?;
    }

    user_feeds::Model::set_folder(db, user_id, id, payload.folder_id)
        .await?
        .ok_or_else(|| AppError::not_found("Feed subscription not found"))?;

    Ok(StatusCode::OK)
}

#[derive(Debug, Deserialize)]
pub struct ListFolderArticlesParams {
    #[serde(flatten)]
    pub pagination: PaginationParams,
    #[serde(default)]
    pub only_saved: bool,
    /// Override the persisted only_unread preference. Absent = use value from feed_folders.
    pub only_unread: Option<bool>,
}

/// List articles across all feeds in a folder
#[utoipa::path(
    get,
    path = "/folders/{id}/articles",
    params(
        ("id" = i32, Path, description = "Folder ID"),
        PaginationParams,
    ),
    responses(
        (status = 200, description = "Folder articles", body = PaginatedResponse<ArticleResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Folder not found"),
    ),
    security(("Bearer" = [])),
    tag = "feeds"
)]
pub async fn list_folder_articles(
    State(state): State<Arc<AppStorage>>,
    folder_ctx: FolderContext,
    Query(params): Query<ListFolderArticlesParams>,
) -> Result<Json<PaginatedResponse<ArticleResponse>>, AppError> {
    let db = &state.db;
    let user_id = folder_ctx.user_id;

    // Get all feed IDs in this folder for this user
    let subs = user_feeds::Model::for_user_in_folder(db, user_id, folder_ctx.folder.id).await?;
    let feed_ids: Vec<i32> = subs.iter().map(|s| s.feed_id).collect();

    if feed_ids.is_empty() {
        return Ok(Json(PaginatedResponse {
            data: vec![],
            metadata: kaleido::glass::data::pagination::PaginationMetadata {
                page: params.pagination.page.max(1),
                per_page: params.pagination.per_page.clamp(1, 100),
                total: 0,
                total_pages: 1,
            },
        }));
    }

    // Get active feed IDs only
    let active_feeds = feeds::Model::find_active_by_ids(db, feed_ids.clone()).await?;
    let active_ids: Vec<i32> = active_feeds.iter().map(|f| f.id).collect();

    let paginated = articles::Entity::find()
        .filter(articles::Column::FeedId.is_in(active_ids))
        .order_by_desc(articles::Column::CreatedAt)
        .fetch_paginated(db, &params.pagination)
        .await?;

    let article_ids: Vec<i32> = paginated.data.iter().map(|a| a.id).collect();
    let state_map = user_articles::Model::state_map_for_user(db, user_id, article_ids).await?;

    let mapped = paginated.map(|a| {
        let (read_at, saved_at) = state_map.get(&a.id).copied().unwrap_or((None, None));
        ArticleResponse::from_model_list(a, read_at, saved_at)
    });

    // Determine effective only_unread: use query param if provided, else use folder's persisted value
    let effective_only_unread = params.only_unread.unwrap_or(folder_ctx.folder.only_unread);

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
    } else if effective_only_unread {
        let unread: Vec<ArticleResponse> = mapped
            .data
            .into_iter()
            .filter(|a| a.read_at.is_none())
            .collect();
        Ok(Json(PaginatedResponse {
            data: unread,
            metadata: mapped.metadata,
        }))
    } else {
        Ok(Json(mapped))
    }
}
