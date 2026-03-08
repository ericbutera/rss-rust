use anyhow::Context;
use api::entities::{articles, feeds};
use async_trait::async_trait;
use background_jobs::worker::TaskProcessor;
use feed_rs::parser;
use reqwest::header::{ETAG, IF_NONE_MATCH, LAST_MODIFIED};
use sea_orm::DatabaseConnection;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::Duration;

const FETCH_TIMEOUT: Duration = Duration::from_secs(30);

/// Strip dangerous HTML while keeping common formatting tags.
/// This is a best-effort server-side sanitization; DOMPurify provides
/// a second layer on the client before rendering.
fn sanitize_html(html: Option<String>) -> Option<String> {
    html.map(|s| ammonia::clean(&s))
}

pub struct FeedFetcher {
    db: Arc<DatabaseConnection>,
    http: reqwest::Client,
}

impl FeedFetcher {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(FETCH_TIMEOUT)
            .user_agent("rss-reader/1.0")
            .build()
            .expect("Failed to build HTTP client");
        Self { db, http }
    }

    async fn process_feed(&self, feed: &feeds::Model) -> anyhow::Result<()> {
        let db = self.db.as_ref();

        // Look up last etag from fetch_history
        let etag = self.last_etag(feed.id).await;

        let mut req = self.http.get(&feed.url);
        if let Some(ref tag) = etag {
            req = req.header(IF_NONE_MATCH, tag.as_str());
        }

        let resp = req.send().await.context("HTTP request failed")?;
        let status = resp.status().as_u16() as i32;

        let new_etag = resp
            .headers()
            .get(ETAG)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let last_modified = resp
            .headers()
            .get(LAST_MODIFIED)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        // Record fetch history
        self.record_history(feed.id, status, new_etag.as_deref())
            .await;

        if status == 304 {
            tracing::debug!(feed_id = feed.id, "feed not modified (304)");
            return Ok(());
        }

        if !resp.status().is_success() {
            tracing::warn!(
                feed_id = feed.id,
                status,
                "feed returned non-success status"
            );
            return Ok(());
        }

        let bytes = resp.bytes().await.context("Failed to read response body")?;

        let parsed = parser::parse(bytes.as_ref()).context("Failed to parse feed")?;

        for entry in parsed.entries {
            let url = entry
                .links
                .first()
                .map(|l| l.href.clone())
                .or_else(|| Some(entry.id.clone()).filter(|id| id.starts_with("http")))
                .unwrap_or_default();

            if url.is_empty() {
                continue;
            }

            let url_hash = {
                let mut h = Sha256::new();
                h.update(url.as_bytes());
                hex::encode(h.finalize())
            };

            // Skip if article already exists (dedup by URL)
            if articles::Model::exists_by_url(db, &url).await? {
                continue;
            }

            let title = entry.title.map(|t| t.content);
            let description = sanitize_html(
                entry
                    .summary
                    .map(|s| s.content)
                    .or_else(|| entry.content.as_ref().and_then(|c| c.body.clone())),
            );
            let content = sanitize_html(entry.content.and_then(|c| c.body));
            let guid = Some(if entry.id.is_empty() {
                url_hash.clone()
            } else {
                entry.id.clone()
            });

            articles::Model::create(db, feed.id, url, title, description, content, guid).await?;
        }

        let _ = last_modified; // reserved for future conditional GET support
        Ok(())
    }

    async fn last_etag(&self, feed_id: i32) -> Option<String> {
        use api::entities::fetch_history;
        fetch_history::Model::last_etag_for_feed(self.db.as_ref(), feed_id).await
    }

    async fn record_history(&self, feed_id: i32, status_code: i32, etag: Option<&str>) {
        use api::entities::fetch_history;
        if let Err(e) =
            fetch_history::Model::record(self.db.as_ref(), feed_id, status_code, etag).await
        {
            tracing::warn!(feed_id, "failed to record fetch history: {e}");
        }
    }
}

#[async_trait]
impl TaskProcessor for FeedFetcher {
    fn task_type(&self) -> &str {
        "feed_fetcher"
    }

    /// Runs on a schedule — no payload needed
    fn schedule(&self) -> Option<&str> {
        Some("0 0 * * * *") // every hour, at :00
    }

    async fn process(
        &self,
        _task_id: i32,
        _payload: Value,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let db = self.db.as_ref();

        let active_feeds = feeds::Model::find_active(db).await?;

        tracing::info!(count = active_feeds.len(), "processing feeds");

        for feed in &active_feeds {
            if let Err(e) = self.process_feed(feed).await {
                tracing::error!(feed_id = feed.id, url = %feed.url, "failed to fetch feed: {e:?}");
            }
        }

        Ok(())
    }
}
