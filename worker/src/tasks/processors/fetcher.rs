use anyhow::Context;
use api::entities::{articles, feeds, fetch_history, user_feeds};
use async_trait::async_trait;
use background_jobs::worker::TaskProcessor;
use chrono::Utc;
use feed_rs::parser;
use reqwest::header::{ETAG, IF_NONE_MATCH};
use sea_orm::DatabaseConnection;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::Duration;

const FETCH_TIMEOUT: Duration = Duration::from_secs(30);

struct FeedFetchResult {
    status: i32,
    etag: Option<String>,
    content_length: Option<i64>,
    error_message: Option<String>,
    bytes: Option<Vec<u8>>,
}

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
        let result = self.fetch_feed(feed).await?;

        let article_count = match result.bytes {
            Some(ref bytes) => {
                let parsed =
                    parser::parse::<&[u8]>(bytes.as_ref()).context("Failed to parse feed")?;
                let mut count = 0i32;
                for entry in parsed.entries {
                    if self.process_entry(feed.id, entry).await? {
                        count += 1;
                    }
                }
                count
            }
            None => 0,
        };

        self.record_history(feed.id, &result, article_count).await;

        Ok(())
    }

    async fn fetch_feed(&self, feed: &feeds::Model) -> anyhow::Result<FeedFetchResult> {
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

        let content_length = resp
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<i64>().ok());

        if status == 304 {
            tracing::debug!(feed_id = feed.id, "feed not modified (304)");
            return Ok(FeedFetchResult {
                status,
                etag: new_etag,
                content_length,
                error_message: None,
                bytes: None,
            });
        }

        if !resp.status().is_success() {
            let error_message = Some(format!("HTTP {status}"));
            tracing::warn!(
                feed_id = feed.id,
                status,
                "feed returned non-success status"
            );
            return Ok(FeedFetchResult {
                status,
                etag: new_etag,
                content_length,
                error_message,
                bytes: None,
            });
        }

        let bytes = resp.bytes().await.context("Failed to read response body")?;
        Ok(FeedFetchResult {
            status,
            etag: new_etag,
            content_length: content_length.or(Some(bytes.len() as i64)),
            error_message: None,
            bytes: Some(bytes.to_vec()),
        })
    }

    /// Returns `true` if a new article was inserted, `false` if it already existed.
    async fn process_entry(
        &self,
        feed_id: i32,
        entry: feed_rs::model::Entry,
    ) -> anyhow::Result<bool> {
        let url = entry
            .links
            .first()
            .map(|l| l.href.clone())
            .or_else(|| Some(entry.id.clone()).filter(|id| id.starts_with("http")))
            .unwrap_or_default();

        if url.is_empty() {
            return Ok(false);
        }

        let url_hash = {
            let mut h = Sha256::new();
            h.update(url.as_bytes());
            hex::encode(h.finalize())
        };

        let db = self.db.as_ref();

        if articles::Model::exists_by_url(db, &url).await? {
            return Ok(false);
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

        articles::Model::create(db, feed_id, url, title, description, content, guid).await?;

        if let Err(e) = user_feeds::Model::increment_unread_for_feed(db, feed_id).await {
            tracing::warn!(feed_id, "failed to increment unread count: {e}");
        }

        Ok(true)
    }

    async fn last_etag(&self, feed_id: i32) -> Option<String> {
        fetch_history::Model::last_etag_for_feed(self.db.as_ref(), feed_id).await
    }

    async fn record_history(&self, feed_id: i32, result: &FeedFetchResult, article_count: i32) {
        if let Err(e) = fetch_history::Model::record(
            self.db.as_ref(),
            feed_id,
            result.status,
            result.etag.as_deref(),
            result.error_message.as_deref(),
            result.content_length,
            Some(article_count),
        )
        .await
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

        tracing::info!(count = active_feeds.len(), "checking feeds for due fetches");

        let feed_ids: Vec<i32> = active_feeds.iter().map(|f| f.id).collect();
        let last_fetch_map = fetch_history::Model::last_fetch_times(db, &feed_ids).await?;
        let now = Utc::now();

        let mut due_count = 0usize;
        for feed in &active_feeds {
            let is_due = match last_fetch_map.get(&feed.id) {
                None => true, // never fetched
                Some(last) => (now - *last).num_minutes() >= feed.fetch_interval_minutes as i64,
            };

            if !is_due {
                continue;
            }

            due_count += 1;
            if let Err(e) = self.process_feed(feed).await {
                tracing::error!(feed_id = feed.id, url = %feed.url, "failed to fetch feed: {e:?}");
            }
        }

        tracing::info!(
            due = due_count,
            total = active_feeds.len(),
            "feed fetch run complete"
        );

        Ok(())
    }
}
