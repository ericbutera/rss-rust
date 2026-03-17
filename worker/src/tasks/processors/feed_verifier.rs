use anyhow::Context;
use api::entities::feeds;
use async_trait::async_trait;
use feed_rs::parser;
use kaleido::background_jobs::worker::TaskProcessor;
use kaleido::background_jobs::{DurableStorage, TaskQueue};
use reqwest::header::ETAG;
use sea_orm::DatabaseConnection;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;

const VERIFY_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize)]
struct Payload {
    feed_id: i32,
}

pub struct FeedVerifier {
    db: Arc<DatabaseConnection>,
    http: reqwest::Client,
}

impl FeedVerifier {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(VERIFY_TIMEOUT)
            .user_agent("rss-reader/1.0")
            .build()
            .expect("Failed to build HTTP client for FeedVerifier");
        Self { db, http }
    }
}

#[async_trait]
impl TaskProcessor for FeedVerifier {
    fn task_type(&self) -> &str {
        "feed_verifier"
    }

    fn schedule(&self) -> Option<&str> {
        None // one-shot per feed, not a cron job
    }

    async fn process(
        &self,
        _task_id: i32,
        payload: Value,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let p: Payload =
            serde_json::from_value(payload).context("Invalid feed_verifier payload")?;
        let db = self.db.as_ref();

        let feed = feeds::Model::find_by_id(db, p.feed_id)
            .await
            .context("DB error looking up feed")?
            .with_context(|| format!("Feed {} not found", p.feed_id))?;

        if feed.verified_at.is_some() {
            tracing::debug!(feed_id = p.feed_id, "feed already verified, skipping");
            return Ok(());
        }

        tracing::info!(feed_id = p.feed_id, url = %feed.url, "verifying feed");

        let resp = self
            .http
            .get(&feed.url)
            .send()
            .await
            .context("HTTP request failed while verifying feed")?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            return Err(format!("Feed URL returned HTTP {status}").into());
        }

        let status = resp.status().as_u16() as i32;
        let etag = resp
            .headers()
            .get(ETAG)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let bytes = resp
            .bytes()
            .await
            .context("Failed to read response body during verification")?;

        // The only requirement is that it parses as a valid RSS/Atom feed.
        // If it doesn't, hand off to FeedDiscovery which will look for the real
        // feed URL or fall back to LLM-based page scraping.
        if parser::parse::<&[u8]>(bytes.as_ref()).is_err() {
            tracing::info!(
                feed_id = p.feed_id,
                "not a valid RSS/Atom feed — enqueuing feed_discovery"
            );
            let storage = DurableStorage::new((*self.db).clone());
            let queue = TaskQueue::new(storage);
            if let Err(e) = queue
                .enqueue(
                    "feed_discovery".to_string(),
                    serde_json::json!({ "feed_id": p.feed_id }),
                )
                .await
            {
                tracing::warn!(feed_id = p.feed_id, "failed to enqueue feed_discovery: {e}");
            }
            return Ok(());
        }

        feeds::Model::mark_verified(db, p.feed_id)
            .await
            .context("Failed to mark feed as verified")?;

        tracing::info!(feed_id = p.feed_id, "feed verified successfully");

        // Immediately parse and persist the articles we just downloaded so users
        // don't have to wait for the next hourly fetch cycle.
        let service = crate::feed_fetcher::FeedFetchService::new(self.db.clone());
        match service
            .process_feed_with_bytes(p.feed_id, status, etag.as_deref(), bytes.as_ref())
            .await
        {
            Ok(n) => tracing::info!(
                feed_id = p.feed_id,
                articles = n,
                "initial feed fetch complete"
            ),
            Err(e) => tracing::warn!(feed_id = p.feed_id, "initial feed fetch failed: {e}"),
        }

        Ok(())
    }
}
