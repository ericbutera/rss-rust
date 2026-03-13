use crate::feed_fetcher::FeedFetchService;
use anyhow::Context;
use api::entities::feeds;
use async_trait::async_trait;
use background_jobs::worker::TaskProcessor;
use sea_orm::DatabaseConnection;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

#[derive(Debug, Deserialize)]
struct Payload {
    feed_id: i32,
}

/// Task processor for admin-triggered single-feed fetches.
///
/// Unlike the scheduled `feed_fetcher`, this runs immediately for one specific
/// feed regardless of its configured interval. Delegates to [`FeedFetchService`].
pub struct SingleFeedFetcher {
    service: Arc<FeedFetchService>,
    db: Arc<DatabaseConnection>,
}

impl SingleFeedFetcher {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self {
            service: Arc::new(FeedFetchService::new(db.clone())),
            db,
        }
    }
}

#[async_trait]
impl TaskProcessor for SingleFeedFetcher {
    fn task_type(&self) -> &str {
        "feed_fetch_single"
    }

    async fn process(
        &self,
        _task_id: i32,
        payload: Value,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let p: Payload =
            serde_json::from_value(payload).context("Invalid feed_fetch_single payload")?;

        let feed = feeds::Model::find_by_id(self.db.as_ref(), p.feed_id)
            .await
            .context("DB error looking up feed")?
            .with_context(|| format!("Feed {} not found", p.feed_id))?;

        tracing::info!(feed_id = feed.id, url = %feed.url, "admin-triggered single feed fetch");

        let new_articles = self
            .service
            .process_feed(&feed)
            .await
            .with_context(|| format!("Failed to fetch feed {}", feed.id))?;

        Ok(())
    }
}
