pub mod processors;

use api::config::Config;
use auth::worker::{
    register_all_auth_processors as register_shared_auth_processors, AuthWorkerConfig,
    AuthWorkerSmtpConfig,
};
use background_jobs::worker::{spawn_scheduler, TaskProcessor, TaskWorker, WorkerError};
use background_jobs::{DurableStorage, TaskQueue};
use std::sync::Arc;

pub use processors::*;

pub fn register_auth_email_processors(
    worker: TaskWorker,
    cfg: &Config,
) -> Result<TaskWorker, WorkerError> {
    let auth_worker_config = AuthWorkerConfig::new(
        cfg.app_name.clone(),
        AuthWorkerSmtpConfig {
            host: cfg.smtp_host.clone(),
            port: cfg.smtp_port,
            username: cfg.smtp_username.clone(),
            password: cfg.smtp_password.clone(),
            from_email: cfg.smtp_from_email.clone(),
            from_name: cfg.smtp_from_name.clone(),
        },
    );
    let worker = register_shared_auth_processors(worker, &auth_worker_config)?;
    let email_notification = Arc::new(EmailNotification::new(cfg)?);

    Ok(worker.register_processor(email_notification))
}

pub async fn register_default_processors(
    worker: TaskWorker,
    db: Arc<sea_orm::DatabaseConnection>,
) -> Result<TaskWorker, WorkerError> {
    let fetcher = Arc::new(FeedFetcher::new(db.clone()));
    let verifier = Arc::new(FeedVerifier::new(db.clone()));
    let single_fetcher = Arc::new(SingleFeedFetcher::new(db.clone()));

    // Spawn the cron scheduler so feed_fetcher tasks are enqueued on schedule
    let db_for_scheduler = (*db).clone();
    spawn_scheduler(fetcher.schedule(), move || {
        let storage = DurableStorage::new(db_for_scheduler.clone());
        let queue = TaskQueue::new(storage);
        async move {
            queue
                .enqueue("feed_fetcher".to_string(), serde_json::json!({}))
                .await
                .map(|_| ())
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
        }
    });

    Ok(worker
        .register_processor(fetcher)
        .register_processor(verifier)
        .register_processor(single_fetcher))
}
