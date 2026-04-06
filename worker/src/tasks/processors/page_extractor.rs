//! Task processor: extract articles from a non-RSS web page using an LLM.
//!
//! For feeds with `feed_type = "scraped"` this processor:
//! 1. Fetches the listing page (`feed.source_url`)
//! 2. Asks Ollama for a list of article URLs on that page
//! 3. For each article URL (up to [`MAX_ARTICLES`]):
//!    - Fetches the article page
//!    - Extracts title, description, image, and body text via heuristics
//!    - Persists a new article row with all fields populated

use crate::html_extractor;
use crate::ollama::OllamaClient;
use anyhow::Context;
use api::entities::{articles, feeds, user_feeds};
use async_trait::async_trait;
use kaleido::background_jobs::worker::TaskProcessor;
use sea_orm::DatabaseConnection;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::Duration;

const FETCH_TIMEOUT: Duration = Duration::from_secs(30);
/// Cap the number of articles extracted per run to avoid very long tasks.
const MAX_ARTICLES: usize = 20;

#[derive(Debug, Deserialize)]
struct Payload {
    feed_id: i32,
}

#[derive(Deserialize, Debug)]
pub(crate) struct ArticleLink {
    pub(crate) title: Option<String>,
    pub(crate) url: String,
}

pub struct PageExtractor {
    db: Arc<DatabaseConnection>,
    http: reqwest::Client,
    ollama: OllamaClient,
}

impl PageExtractor {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(FETCH_TIMEOUT)
            .user_agent("rss-reader/1.0")
            .build()
            .expect("Failed to build HTTP client for PageExtractor");

        Self {
            db,
            http,
            ollama: OllamaClient::from_env(),
        }
    }

    async fn fetch_html(&self, url: &str) -> anyhow::Result<String> {
        fetch_page(&self.http, url).await
    }

    /// Ask Ollama to extract article title+URL pairs from the listing page text.
    async fn extract_article_links(&self, page_url: &str, html: &str) -> Vec<ArticleLink> {
        extract_links(&self.ollama, page_url, html).await
    }

    /// Fetch one article page, extract its content, and persist it.
    /// Returns `true` if a new article was inserted.
    async fn process_article(
        &self,
        feed_id: i32,
        url: &str,
        title_hint: Option<String>,
    ) -> anyhow::Result<bool> {
        let db = self.db.as_ref();

        if articles::Model::exists_by_url(db, url).await? {
            return Ok(false);
        }

        let html = match self.fetch_html(url).await {
            Ok(h) => h,
            Err(e) => {
                tracing::warn!(url = %url, "failed to fetch article page: {e}");
                return Ok(false);
            }
        };

        let extracted = html_extractor::extract_article(&html);

        // Prefer the extracted title; fall back to the hint supplied by the
        // listing-page LLM extraction.
        let title = extracted.title.or(title_hint);

        let guid = {
            let mut h = Sha256::new();
            h.update(url.as_bytes());
            Some(hex::encode(h.finalize()))
        };

        articles::Model::create_full(
            db,
            feed_id,
            url.to_string(),
            title,
            extracted.description,
            extracted.image_url,
            extracted.preview,
            extracted.content,
            None, // author not available from page extraction
            guid,
        )
        .await?;

        if let Err(e) = user_feeds::Model::increment_unread_for_feed(db, feed_id).await {
            tracing::warn!(feed_id, "failed to increment unread count: {e}");
        }

        Ok(true)
    }
}

#[async_trait]
impl TaskProcessor for PageExtractor {
    fn task_type(&self) -> &str {
        "page_extractor"
    }

    fn schedule(&self) -> Option<&str> {
        None
    }

    async fn process(
        &self,
        _task_id: i32,
        payload: Value,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let p: Payload =
            serde_json::from_value(payload).context("Invalid page_extractor payload")?;
        let db = self.db.as_ref();

        let feed = feeds::Model::find_by_id(db, p.feed_id)
            .await
            .context("DB error looking up feed")?
            .with_context(|| format!("Feed {} not found", p.feed_id))?;

        // source_url is the original listing page URL set during discovery.
        // Fall back to feed.url for robustness.
        let source_url = feed.source_url.as_deref().unwrap_or(&feed.url).to_string();

        tracing::info!(feed_id = p.feed_id, url = %source_url, "extracting articles from page");

        let html = self
            .fetch_html(&source_url)
            .await
            .context("Failed to fetch listing page")?;

        let links = self.extract_article_links(&source_url, &html).await;

        if links.is_empty() {
            tracing::warn!(feed_id = p.feed_id, "no article links returned by LLM");
            return Ok(());
        }

        tracing::info!(
            feed_id = p.feed_id,
            count = links.len(),
            "article links found"
        );

        let mut new_count = 0usize;

        for link in links.into_iter().take(MAX_ARTICLES) {
            // Resolve relative URLs against the listing page
            let url = if link.url.starts_with("http://") || link.url.starts_with("https://") {
                link.url
            } else {
                match url::Url::parse(&source_url)
                    .ok()
                    .and_then(|b| b.join(&link.url).ok())
                {
                    Some(resolved) => resolved.to_string(),
                    None => {
                        tracing::warn!(href = %link.url, "skipping unresolvable URL");
                        continue;
                    }
                }
            };

            match self.process_article(p.feed_id, &url, link.title).await {
                Ok(true) => new_count += 1,
                Ok(false) => {}
                Err(e) => {
                    tracing::warn!(url = %url, "failed to process article: {e}");
                }
            }
        }

        tracing::info!(
            feed_id = p.feed_id,
            new_articles = new_count,
            "page extraction complete"
        );

        Ok(())
    }
}

/// Fetch an HTML page and return its body as a string.
pub(crate) async fn fetch_page(http: &reqwest::Client, url: &str) -> anyhow::Result<String> {
    let resp = http.get(url).send().await.context("HTTP request failed")?;

    if !resp.status().is_success() {
        return Err(anyhow::anyhow!("HTTP {}", resp.status().as_u16()));
    }

    resp.text().await.context("Failed to read response body")
}

/// Ask Ollama to extract article title+URL pairs from a listing page.
pub(crate) async fn extract_links(
    ollama: &OllamaClient,
    page_url: &str,
    html: &str,
) -> Vec<ArticleLink> {
    let text = html_extractor::html_to_text(html, 4000);
    let prompt = format!(
        "You are extracting article listings from a web page at {page_url}.\n\
         Here is the page text:\n\n{text}\n\n\
         Extract all article titles and their URLs.\n\
         Return a JSON array: [{{\"title\": \"...\", \"url\": \"...\"}}]\n\
         Only include actual article or blog post links.\n\
         Do not include navigation, footer, or utility links.\n\
         Return only a valid JSON array, nothing else."
    );

    match ollama.generate(&prompt).await {
        Ok(response) => match serde_json::from_str::<Vec<ArticleLink>>(&response) {
            Ok(links) => links,
            Err(e) => {
                tracing::warn!("Failed to parse article link JSON from LLM: {e}");
                vec![]
            }
        },
        Err(e) => {
            tracing::warn!("Ollama request failed during article-link extraction: {e}");
            vec![]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ollama::OllamaClient;
    use std::time::Duration;

    fn http(timeout_secs: u64) -> reqwest::Client {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(timeout_secs))
            .build()
            .unwrap()
    }

    #[tokio::test]
    async fn fetch_page_returns_body_on_200() {
        let mut srv = mockito::Server::new_async().await;
        srv.mock("GET", "/article")
            .with_status(200)
            .with_body("<html><body><p>Hello world</p></body></html>")
            .create_async()
            .await;

        let result = fetch_page(&http(5), &format!("{}/article", srv.url()))
            .await
            .unwrap();
        assert!(result.contains("Hello world"));
    }

    #[tokio::test]
    async fn fetch_page_errors_on_404() {
        let mut srv = mockito::Server::new_async().await;
        srv.mock("GET", "/missing")
            .with_status(404)
            .create_async()
            .await;

        let result = fetch_page(&http(5), &format!("{}/missing", srv.url())).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn extract_links_parses_valid_json_array() {
        let mut ollama_srv = mockito::Server::new_async().await;
        ollama_srv
            .mock("POST", "/api/generate")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"response":"[{\"title\":\"Post One\",\"url\":\"https://example.com/1\"},{\"title\":\"Post Two\",\"url\":\"https://example.com/2\"}]"}"#)
            .create_async()
            .await;

        let ollama = OllamaClient::new(ollama_srv.url());
        let links = extract_links(
            &ollama,
            "https://example.com",
            "<html><body><p>Blog</p></body></html>",
        )
        .await;

        assert_eq!(links.len(), 2);
        assert_eq!(links[0].url, "https://example.com/1");
        assert_eq!(links[1].title.as_deref(), Some("Post Two"));
    }

    #[tokio::test]
    async fn extract_links_returns_empty_on_invalid_json() {
        let mut ollama_srv = mockito::Server::new_async().await;
        ollama_srv
            .mock("POST", "/api/generate")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"response":"I could not find any article links on this page."}"#)
            .create_async()
            .await;

        let ollama = OllamaClient::new(ollama_srv.url());
        let links = extract_links(&ollama, "https://example.com", "<html/>").await;
        assert!(links.is_empty(), "Should return empty vec on invalid JSON");
    }

    #[tokio::test]
    async fn extract_links_returns_empty_when_ollama_unavailable() {
        let ollama = OllamaClient::new("http://127.0.0.1:19999".to_string());
        let links = extract_links(&ollama, "https://example.com", "<html/>").await;
        assert!(
            links.is_empty(),
            "Should return empty vec when Ollama is down"
        );
    }

    #[tokio::test]
    async fn extract_links_returns_empty_for_empty_json_array() {
        let mut ollama_srv = mockito::Server::new_async().await;
        ollama_srv
            .mock("POST", "/api/generate")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"response":"[]"}"#)
            .create_async()
            .await;

        let ollama = OllamaClient::new(ollama_srv.url());
        let links = extract_links(&ollama, "https://example.com", "<html/>").await;
        assert!(links.is_empty());
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use crate::ollama::OllamaClient;
    use std::time::Duration;

    async fn ollama_available() -> bool {
        reqwest::Client::new()
            .get(format!(
                "{}/api/tags",
                std::env::var("OLLAMA_URL")
                    .unwrap_or_else(|_| "http://localhost:11434".to_string())
            ))
            .timeout(Duration::from_secs(3))
            .send()
            .await
            .is_ok()
    }

    /// Happy path: serve a clear blog listing page → LLM should return ≥0 links
    /// without panicking.
    #[tokio::test]
    #[ignore = "requires running compose stack with Ollama (docker compose up)"]
    async fn integration_extract_links_from_blog_listing() {
        if !ollama_available().await {
            eprintln!("skip: Ollama not reachable");
            return;
        }

        let ollama = OllamaClient::from_env();
        let links = extract_links(
            &ollama,
            "https://example.com",
            crate::test_fixtures::BLOG_LISTING_CLEAR,
        )
        .await;

        println!("Extracted {} article links", links.len());
        for link in &links {
            println!("  {:?} -> {}", link.title, link.url);
        }
    }

    /// Confusing dashboard page: LLM should not panic.
    #[tokio::test]
    #[ignore = "requires running compose stack with Ollama (docker compose up)"]
    async fn integration_extract_links_from_confusing_page() {
        if !ollama_available().await {
            eprintln!("skip: Ollama not reachable");
            return;
        }

        let ollama = OllamaClient::from_env();
        let links = extract_links(
            &ollama,
            "https://example.com",
            crate::test_fixtures::CONFUSING_PAGE_NO_ARTICLES,
        )
        .await;

        println!(
            "Extracted {} links from confusing page (may be 0 or dashboard links)",
            links.len()
        );
    }
}
