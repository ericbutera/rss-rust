use crate::app_error::AppError;
use crate::entities::feed_folders;
use crate::storage::AppStorage;
use axum::async_trait;
use axum::extract::{FromRef, FromRequestParts, Path};
use axum::http::request::Parts;
use kaleido::auth::UserContext;
use std::sync::Arc;

/// Extractor that validates the `id` path parameter refers to a folder owned
/// by the authenticated user and returns the folder model.
pub struct FolderContext {
    pub folder: feed_folders::Model,
    pub user_id: i32,
}

#[async_trait]
impl<S> FromRequestParts<S> for FolderContext
where
    Arc<AppStorage>: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let user_ctx = UserContext::<AppStorage>::from_request_parts(parts, state).await?;

        let Path(id): Path<i32> = Path::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::not_found("Folder not found"))?;

        let storage: Arc<AppStorage> = FromRef::from_ref(state);
        let folder = feed_folders::Model::find_by_id_and_user(&storage.db, id, user_ctx.user.id)
            .await?
            .ok_or_else(|| AppError::not_found("Folder not found"))?;

        Ok(FolderContext {
            folder,
            user_id: user_ctx.user.id,
        })
    }
}
