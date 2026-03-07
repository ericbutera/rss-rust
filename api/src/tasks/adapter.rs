use sea_orm::DatabaseConnection;
use std::sync::Arc;

pub use auth::{AuthTaskQueue as TaskQueue, DefaultEnvAuthService as AppAuthService};

pub fn create_auth_service(db: DatabaseConnection, tasks: TaskQueue) -> AppAuthService {
    auth::create_auth_service(Arc::new(db), tasks)
}
