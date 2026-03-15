use axum::http::StatusCode;
use axum::{response::IntoResponse, Json};
use sea_orm::DbErr;
use serde::Serialize;
use serde_json::json;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct ApiErrorResponse {
    pub message: String,
}

#[derive(Debug)]
pub struct AppError {
    pub code: StatusCode,
    pub message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let body = json!({ "message": self.message });
        (self.code, Json(body)).into_response()
    }
}

impl From<DbErr> for AppError {
    fn from(err: DbErr) -> Self {
        tracing::error!("Database error: {:?}", err);
        Self {
            code: StatusCode::INTERNAL_SERVER_ERROR,
            message: "Database error".to_string(),
        }
    }
}

impl From<kaleido::auth::AuthError> for AppError {
    fn from(err: kaleido::auth::AuthError) -> Self {
        Self {
            code: err.code,
            message: err.message,
        }
    }
}

impl AppError {
    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            code: StatusCode::NOT_FOUND,
            message: message.into(),
        }
    }

    pub fn internal_error(message: impl Into<String>) -> Self {
        Self {
            code: StatusCode::INTERNAL_SERVER_ERROR,
            message: message.into(),
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self {
            code: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self {
            code: StatusCode::CONFLICT,
            message: message.into(),
        }
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self {
            code: StatusCode::FORBIDDEN,
            message: message.into(),
        }
    }
}
