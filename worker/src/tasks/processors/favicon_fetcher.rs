use api::config::Config;
use api::entities::feeds;
use async_trait::async_trait;
use chrono::Utc;
use kaleido::background_jobs::worker::TaskProcessor;
use sea_orm::{DatabaseConnection, Set};
use serde_json::Value;
use std::sync::Arc;
use url::Url;

/// Task processor that fetches and stores favicons for feeds that have never had
/// a favicon fetch attempted (`favicon_fetched_at IS NULL`).
///
/// ## Deduplication / concurrency safety
///
/// Before issuing any HTTP request the processor sets `favicon_fetched_at = now()`
/// on the feed row.  This acts as a soft lock: if a second `favicon_fetcher` task
/// happens to run concurrently (e.g. from a manually triggered admin request while
/// the scheduled one is already in progress) it will skip rows that already have
/// `favicon_fetched_at` set, ensuring each feed is only fetched once per cycle.
///
/// If the fetch fails, `favicon_fetched_at` remains set and `favicon_url` stays
/// NULL — the feed won't be retried automatically.  An admin can clear
/// `favicon_fetched_at` in the database to force a retry, or wait for a future
/// dedicated "retry-failed" maintenance task.
pub struct FaviconFetcher {
    db: Arc<DatabaseConnection>,
    http: reqwest::Client,
}

impl FaviconFetcher {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::limited(3))
            .user_agent("Mozilla/5.0 (compatible; RSSFaviconBot/1.0)")
            .build()
            .expect("failed to build favicon HTTP client");
        Self { db, http }
    }

    /// Attempt to fetch `/favicon.ico` from the feed's origin.
    ///
    /// Returns the filename (not full path) that was written to disk, or `None`
    /// if no usable favicon could be retrieved.
    async fn fetch_and_store(&self, feed: &feeds::Model) -> Option<String> {
        let url = Url::parse(&feed.url).ok()?;
        let origin = format!("{}://{}", url.scheme(), url.host_str()?);
        let favicon_url = format!("{}/favicon.ico", origin);

        let resp = self.http.get(&favicon_url).send().await.ok()?;

        if !resp.status().is_success() {
            tracing::debug!(
                feed_id = feed.id,
                status = resp.status().as_u16(),
                "favicon not found at {}",
                favicon_url
            );
            return None;
        }

        // Determine file extension from Content-Type header.
        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_lowercase();

        let ext = if content_type.contains("png") {
            "png"
        } else if content_type.contains("svg") {
            "svg"
        } else if content_type.contains("gif") {
            "gif"
        } else if content_type.contains("webp") {
            "webp"
        } else {
            "ico"
        };

        let bytes = resp.bytes().await.ok()?;
        if bytes.is_empty() {
            return None;
        }

        let filename = format!("feed_{}.{}", feed.id, ext);
        let assets_path = &Config::get().assets_path;
        let dir = std::path::Path::new(assets_path).join("favicons");

        if let Err(e) = tokio::fs::create_dir_all(&dir).await {
            tracing::warn!(error = ?e, "failed to create favicons directory");
            return None;
        }

        let file_path = dir.join(&filename);
        if let Err(e) = tokio::fs::write(&file_path, &bytes).await {
            tracing::warn!(feed_id = feed.id, error = ?e, "failed to write favicon to disk");
            return None;
        }

        tracing::debug!(feed_id = feed.id, filename = %filename, "favicon stored");
        Some(filename)
    }
}

#[async_trait]
impl TaskProcessor for FaviconFetcher {
    fn task_type(&self) -> &str {
        "favicon_fetcher"
    }

    /// Run daily at 02:00 UTC to pick up any feeds added since the last run.
    fn schedule(&self) -> Option<&str> {
        Some("0 0 2 * * *")
    }

    async fn process(
        &self,
        _task_id: i32,
        _payload: Value,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let db = self.db.as_ref();

        let pending = feeds::Model::find_needs_favicon_fetch(db).await?;

        tracing::info!(count = pending.len(), "favicon fetch run started");

        let mut fetched = 0usize;
        let mut failed = 0usize;

        for feed in &pending {
            let claim = feeds::ActiveModel {
                id: Set(feed.id),
                favicon_fetched_at: Set(Some(Utc::now())),
                ..Default::default()
            };
            if let Err(e) = sea_orm::ActiveModelTrait::update(claim, db).await {
                tracing::warn!(feed_id = feed.id, error = ?e, "failed to claim favicon_fetched_at");
                continue;
            }

            match self.fetch_and_store(feed).await {
                Some(filename) => {
                    let update = feeds::ActiveModel {
                        id: Set(feed.id),
                        // Store the API-relative path so callers need no extra config.
                        favicon_url: Set(Some(filename)),
                        favicon_fetched_at: Set(Some(Utc::now())),
                        ..Default::default()
                    };
                    if let Err(e) = sea_orm::ActiveModelTrait::update(update, db).await {
                        tracing::warn!(feed_id = feed.id, error = ?e, "failed to persist favicon_url");
                    } else {
                        fetched += 1;
                    }
                }
                None => {
                    tracing::debug!(feed_id = feed.id, url = %feed.url, "no favicon available");
                    failed += 1;
                }
            }
        }

        tracing::info!(
            fetched,
            failed,
            total = pending.len(),
            "favicon fetch run complete"
        );

        Ok(())
    }
}
