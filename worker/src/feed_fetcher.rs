//! Core RSS feed fetching, parsing, and article persistence.
//!
//! This module owns the nuts and bolts of the fetch pipeline:
//! - HTTP GET with ETag conditional requests ([`fetch_url`])
//! - RSS / Atom parsing ([`parse_rss`])
//! - Feed-entry → article-data extraction ([`entry_to_article_data`])
//! - DB persistence and history recording ([`FeedFetchService`])
//!
//! The worker task processors in `tasks::processors` are thin wrappers that
//! decide *which* feeds to fetch and *when*, then delegate the actual work here.

use anyhow::Context;
use api::entities::{articles, feeds, fetch_history, user_feeds};
use feed_rs::model::Entry;
use feed_rs::parser;
use reqwest::header::{ETAG, IF_NONE_MATCH};
use sea_orm::DatabaseConnection;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::Duration;

const FETCH_TIMEOUT: Duration = Duration::from_secs(30);

// ── Data types ────────────────────────────────────────────────────────────────

pub(crate) struct FeedFetchResult {
    pub(crate) status: i32,
    pub(crate) etag: Option<String>,
    pub(crate) content_length: Option<i64>,
    pub(crate) error_message: Option<String>,
    pub(crate) bytes: Option<Vec<u8>>,
}

/// Article fields extracted from a feed entry, ready to be written to the DB.
pub(crate) struct ArticleData {
    pub(crate) url: String,
    pub(crate) title: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) content: Option<String>,
    pub(crate) guid: Option<String>,
}

// ── Pure / free functions (fully testable without DB or network) ──────────────

fn sanitize_html(html: Option<String>) -> Option<String> {
    html.map(|s| {
        ammonia::Builder::default()
            .add_tags(&["img"])
            .add_tag_attributes("img", &["src", "alt", "width", "height", "loading"])
            .clean(&s)
            .to_string()
    })
}

/// Parse raw RSS or Atom bytes into a `feed_rs` document.
pub(crate) fn parse_rss(bytes: &[u8]) -> anyhow::Result<feed_rs::model::Feed> {
    parser::parse::<&[u8]>(bytes).context("Failed to parse feed content")
}

/// Extract structured article data from a feed entry.
///
/// Returns `None` when the entry has no usable URL (entries without a URL
/// cannot be stored and are silently skipped by the service).
pub(crate) fn entry_to_article_data(entry: Entry) -> Option<ArticleData> {
    let url = entry
        .links
        .first()
        .map(|l| l.href.clone())
        .or_else(|| Some(entry.id.clone()).filter(|id| id.starts_with("http")))
        .unwrap_or_default();

    if url.is_empty() {
        return None;
    }

    let guid = Some(if entry.id.is_empty() {
        let mut h = Sha256::new();
        h.update(url.as_bytes());
        hex::encode(h.finalize())
    } else {
        entry.id.clone()
    });

    let title = entry.title.map(|t| t.content);
    let description = sanitize_html(
        entry
            .summary
            .map(|s| s.content)
            .or_else(|| entry.content.as_ref().and_then(|c| c.body.clone())),
    );
    let content = sanitize_html(entry.content.and_then(|c| c.body));

    Some(ArticleData {
        url,
        title,
        description,
        content,
        guid,
    })
}

/// Issue an HTTP GET for `url`, sending `etag` as `If-None-Match` when present.
///
/// Always returns `Ok`; HTTP error status codes are surfaced inside
/// [`FeedFetchResult::error_message`] rather than as `Err`.
pub(crate) async fn fetch_url(
    http: &reqwest::Client,
    url: &str,
    etag: Option<&str>,
) -> anyhow::Result<FeedFetchResult> {
    let mut req = http.get(url);
    if let Some(tag) = etag {
        req = req.header(IF_NONE_MATCH, tag);
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
        return Ok(FeedFetchResult {
            status,
            etag: new_etag,
            content_length,
            error_message: None,
            bytes: None,
        });
    }

    if !resp.status().is_success() {
        return Ok(FeedFetchResult {
            status,
            etag: new_etag,
            content_length,
            error_message: Some(format!("HTTP {status}")),
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

// ── Service ───────────────────────────────────────────────────────────────────

/// Orchestrates fetching a single feed: HTTP → parse → persist → record history.
pub(crate) struct FeedFetchService {
    db: Arc<DatabaseConnection>,
    http: reqwest::Client,
}

impl FeedFetchService {
    pub(crate) fn new(db: Arc<DatabaseConnection>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(FETCH_TIMEOUT)
            .user_agent("rss-reader/1.0")
            .build()
            .expect("Failed to build HTTP client");
        Self { db, http }
    }

    /// Fetch, parse, and persist new articles for `feed`.
    /// Returns the number of new articles stored.
    pub(crate) async fn process_feed(&self, feed: &feeds::Model) -> anyhow::Result<i32> {
        let etag = self.last_etag(feed.id).await;
        let result = fetch_url(&self.http, &feed.url, etag.as_deref()).await?;

        let article_count = match result.bytes {
            Some(ref bytes) => {
                let parsed = parse_rss(bytes)?;
                let mut count = 0i32;
                for entry in parsed.entries {
                    if self.persist_entry(feed.id, entry).await? {
                        count += 1;
                    }
                }
                count
            }
            None => 0,
        };

        self.record_history(feed.id, &result, article_count).await;
        Ok(article_count)
    }

    /// Convert a feed entry to article data and persist it.
    /// Returns `true` if a new article was inserted.
    async fn persist_entry(&self, feed_id: i32, entry: Entry) -> anyhow::Result<bool> {
        let Some(data) = entry_to_article_data(entry) else {
            return Ok(false);
        };

        let db = self.db.as_ref();
        if articles::Model::exists_by_url(db, &data.url).await? {
            return Ok(false);
        }

        articles::Model::create(
            db,
            feed_id,
            data.url,
            data.title,
            data.description,
            data.content,
            data.guid,
        )
        .await?;

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

    /// Parse and persist a feed using bytes that were already downloaded (e.g.
    /// during verification), skipping a redundant HTTP request.
    pub(crate) async fn process_feed_with_bytes(
        &self,
        feed_id: i32,
        status: i32,
        etag: Option<&str>,
        bytes: &[u8],
    ) -> anyhow::Result<i32> {
        let parsed = parse_rss(bytes)?;
        let mut count = 0i32;
        for entry in parsed.entries {
            if self.persist_entry(feed_id, entry).await? {
                count += 1;
            }
        }
        let result = FeedFetchResult {
            status,
            etag: etag.map(|s| s.to_string()),
            content_length: Some(bytes.len() as i64),
            error_message: None,
            bytes: None,
        };
        self.record_history(feed_id, &result, count).await;
        Ok(count)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const MINIMAL_RSS: &[u8] = br#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Article One</title>
      <link>https://example.com/article-1</link>
      <description>First article body</description>
      <guid>guid-abc-123</guid>
    </item>
  </channel>
</rss>"#;

    const MINIMAL_ATOM: &[u8] = br#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <id>https://example.com/atom-1</id>
    <title>Atom Entry</title>
    <link href="https://example.com/atom-1"/>
    <summary>Atom summary text</summary>
  </entry>
</feed>"#;

    /// Parse a single `<item>` block embedded in a minimal RSS wrapper.
    fn entry_from_item(item_xml: &str) -> feed_rs::model::Entry {
        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>T</title><link>https://t.com</link>{item_xml}</channel></rss>"#
        );
        parse_rss(xml.as_bytes())
            .expect("test XML should parse")
            .entries
            .into_iter()
            .next()
            .expect("test XML should produce at least one entry")
    }

    // ── HTTP fetch (mockito local server — no external network) ───────────────

    #[tokio::test]
    async fn test_fetch_url_200_returns_bytes() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/feed.xml")
            .with_status(200)
            .with_header("content-type", "application/rss+xml")
            .with_body(MINIMAL_RSS)
            .create_async()
            .await;

        let http = reqwest::Client::new();
        let result = fetch_url(&http, &format!("{}/feed.xml", server.url()), None)
            .await
            .unwrap();

        assert_eq!(result.status, 200);
        assert!(result.bytes.is_some());
        assert!(result.error_message.is_none());
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_fetch_url_server_error_returns_error_message() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/feed.xml")
            .with_status(500)
            .create_async()
            .await;

        let http = reqwest::Client::new();
        let result = fetch_url(&http, &format!("{}/feed.xml", server.url()), None)
            .await
            .unwrap();

        assert_eq!(result.status, 500);
        assert!(result.bytes.is_none());
        assert_eq!(result.error_message.as_deref(), Some("HTTP 500"));
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_fetch_url_404_returns_error_message() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/feed.xml")
            .with_status(404)
            .create_async()
            .await;

        let http = reqwest::Client::new();
        let result = fetch_url(&http, &format!("{}/feed.xml", server.url()), None)
            .await
            .unwrap();

        assert_eq!(result.status, 404);
        assert!(result.bytes.is_none());
        assert_eq!(result.error_message.as_deref(), Some("HTTP 404"));
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_fetch_url_304_returns_no_bytes() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/feed.xml")
            .with_status(304)
            .create_async()
            .await;

        let http = reqwest::Client::new();
        let result = fetch_url(&http, &format!("{}/feed.xml", server.url()), None)
            .await
            .unwrap();

        assert_eq!(result.status, 304);
        assert!(result.bytes.is_none());
        assert!(result.error_message.is_none());
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_fetch_url_sends_etag_as_if_none_match() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/feed.xml")
            .match_header("if-none-match", "\"etag-abc\"")
            .with_status(304)
            .create_async()
            .await;

        let http = reqwest::Client::new();
        fetch_url(
            &http,
            &format!("{}/feed.xml", server.url()),
            Some("\"etag-abc\""),
        )
        .await
        .unwrap();

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_fetch_url_response_etag_is_captured() {
        let mut server = mockito::Server::new_async().await;
        server
            .mock("GET", "/feed.xml")
            .with_status(200)
            .with_header("etag", "\"new-etag-xyz\"")
            .with_body(MINIMAL_RSS)
            .create_async()
            .await;

        let http = reqwest::Client::new();
        let result = fetch_url(&http, &format!("{}/feed.xml", server.url()), None)
            .await
            .unwrap();

        assert_eq!(result.etag.as_deref(), Some("\"new-etag-xyz\""));
    }

    // ── RSS / Atom parsing ────────────────────────────────────────────────────

    #[test]
    fn test_parse_valid_rss_returns_entries() {
        let feed = parse_rss(MINIMAL_RSS).unwrap();
        assert_eq!(feed.entries.len(), 1);
        assert_eq!(feed.title.unwrap().content, "Test Feed");
    }

    #[test]
    fn test_parse_valid_atom_returns_entries() {
        let feed = parse_rss(MINIMAL_ATOM).unwrap();
        assert_eq!(feed.entries.len(), 1);
        assert_eq!(feed.title.unwrap().content, "Atom Feed");
    }

    #[test]
    fn test_parse_multiple_items() {
        let xml = br#"<?xml version="1.0"?>
<rss version="2.0"><channel><title>F</title>
  <item><title>A</title><link>https://x.com/1</link></item>
  <item><title>B</title><link>https://x.com/2</link></item>
  <item><title>C</title><link>https://x.com/3</link></item>
</channel></rss>"#;
        let feed = parse_rss(xml).unwrap();
        assert_eq!(feed.entries.len(), 3);
    }

    #[test]
    fn test_parse_invalid_content_returns_error() {
        assert!(parse_rss(b"not xml at all").is_err());
    }

    #[test]
    fn test_parse_empty_bytes_returns_error() {
        assert!(parse_rss(b"").is_err());
    }

    // ── Entry → ArticleData conversion ────────────────────────────────────────

    #[test]
    fn test_entry_with_link_extracts_url_title_and_guid() {
        let entry = entry_from_item(
            r#"<item>
                <title>My Article</title>
                <link>https://example.com/article-1</link>
                <guid>guid-abc</guid>
            </item>"#,
        );
        let data = entry_to_article_data(entry).unwrap();
        assert_eq!(data.url, "https://example.com/article-1");
        assert_eq!(data.title.as_deref(), Some("My Article"));
        assert_eq!(data.guid.as_deref(), Some("guid-abc"));
    }

    #[test]
    fn test_entry_with_http_guid_and_no_link_uses_guid_as_url() {
        let entry = entry_from_item(
            r#"<item>
                <title>Only GUID</title>
                <guid isPermaLink="true">https://example.com/guid-only</guid>
            </item>"#,
        );
        let data = entry_to_article_data(entry).unwrap();
        assert_eq!(data.url, "https://example.com/guid-only");
    }

    #[test]
    fn test_entry_with_opaque_guid_and_no_link_returns_none() {
        let entry = entry_from_item(
            r#"<item>
                <title>No URL</title>
                <guid>some-opaque-id-not-a-url</guid>
            </item>"#,
        );
        assert!(entry_to_article_data(entry).is_none());
    }

    #[test]
    fn test_entry_guid_is_preserved_from_parsed_rss() {
        // Verifies the non-empty id branch: the raw guid string becomes the article guid.
        let entry = entry_from_item(
            r#"<item>
                <title>Explicit GUID</title>
                <link>https://example.com/article</link>
                <guid>urn:uuid:explicit-guid-abc</guid>
            </item>"#,
        );
        let data = entry_to_article_data(entry).unwrap();
        assert_eq!(data.url, "https://example.com/article");
        assert_eq!(data.guid.as_deref(), Some("urn:uuid:explicit-guid-abc"));
    }

    #[test]
    fn test_entry_description_is_extracted() {
        let entry = entry_from_item(
            r#"<item>
                <title>With Desc</title>
                <link>https://example.com/with-desc</link>
                <description>Article description text</description>
            </item>"#,
        );
        let data = entry_to_article_data(entry).unwrap();
        assert!(data
            .description
            .as_deref()
            .unwrap_or("")
            .contains("Article description text"));
    }

    #[test]
    fn test_atom_summary_becomes_description() {
        let atom = br#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Feed</title>
  <entry>
    <id>https://example.com/1</id>
    <link href="https://example.com/1"/>
    <summary>This is the Atom summary</summary>
  </entry>
</feed>"#;
        let entry = parse_rss(atom).unwrap().entries.into_iter().next().unwrap();
        let data = entry_to_article_data(entry).unwrap();
        assert!(data
            .description
            .as_deref()
            .unwrap_or("")
            .contains("This is the Atom summary"));
    }

    #[test]
    fn test_entry_without_title_has_none_title() {
        let entry = entry_from_item(
            r#"<item>
                <link>https://example.com/no-title</link>
            </item>"#,
        );
        let data = entry_to_article_data(entry).unwrap();
        assert_eq!(data.url, "https://example.com/no-title");
        assert!(data.title.is_none());
    }
}
