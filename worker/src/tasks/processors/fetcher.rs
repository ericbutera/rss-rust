use crate::feed_fetcher::FeedFetchService;
use api::entities::{feeds, fetch_history};
use async_trait::async_trait;
use background_jobs::worker::TaskProcessor;
use chrono::Utc;
use sea_orm::DatabaseConnection;
use serde_json::Value;
use std::sync::Arc;

/// Task processor that runs the scheduled bulk feed-fetch.
///
/// Responsible for selecting which feeds are due for a refresh and
/// delegating the actual fetch/parse/persist work to [`FeedFetchService`].
pub struct FeedFetcher {
    service: Arc<FeedFetchService>,
    db: Arc<DatabaseConnection>,
}

impl FeedFetcher {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self {
            service: Arc::new(FeedFetchService::new(db.clone())),
            db,
        }
    }
}

#[async_trait]
impl TaskProcessor for FeedFetcher {
    fn task_type(&self) -> &str {
        "feed_fetcher"
    }

    /// Runs on a schedule — no payload needed.
    fn schedule(&self) -> Option<&str> {
        Some("0 0 * * * *") // every hour, at :00
    }

    async fn process(
        &self,
        _task_id: i32,
        _payload: Value,
    ) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
        let db = self.db.as_ref();

        let active_feeds = feeds::Model::find_active(db).await?;

        tracing::info!(
            count = active_feeds.len(),
            "checking active feeds for due fetches"
        );

        let feed_ids: Vec<i32> = active_feeds.iter().map(|f| f.id).collect();
        let last_fetch_map = fetch_history::Model::last_fetch_times(db, &feed_ids).await?;
        let now = Utc::now();

        let mut due_count = 0usize;
        let mut new_articles = 0i32;
        let mut error_count = 0usize;

        for feed in &active_feeds {
            let is_due = match last_fetch_map.get(&feed.id) {
                None => true,
                Some(last) => (now - *last).num_minutes() >= feed.fetch_interval_minutes as i64,
            };

            if !is_due {
                continue;
            }

            due_count += 1;
            match self.service.process_feed(feed).await {
                Ok(count) => new_articles += count,
                Err(e) => {
                    error_count += 1;
                    tracing::error!(feed_id = feed.id, url = %feed.url, "failed to fetch feed: {e:?}");
                }
            }
        }

        tracing::info!(
            due = due_count,
            total = active_feeds.len(),
            new_articles,
            errors = error_count,
            "feed fetch run complete"
        );

        Ok(Some(format!(
            "Checked {} feeds ({} due): {} new articles, {} errors",
            active_feeds.len(),
            due_count,
            new_articles,
            error_count,
        )))
    }
}
