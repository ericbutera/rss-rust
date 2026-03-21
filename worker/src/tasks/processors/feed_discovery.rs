//! Task processor: given a feed URL that failed RSS verification, attempt to
//! discover whether an RSS/Atom feed exists for that site.
//!
//! Discovery order:
//! 1. Parse `<link rel="alternate">` tags from the page HTML
//! 2. Probe common feed paths (`/rss`, `/feed`, `/atom.xml`, …)
//! 3. LLM fallback via Ollama — ask the model to identify a feed URL from the
//!    page text
//!
//! **Outcomes**
//! - Feed found → update `feeds.url` to the RSS URL, re-enqueue `feed_verifier`
//! - No feed found → set `feed_type = "scraped"`, enqueue `page_extractor`

use crate::html_extractor;
use crate::ollama::OllamaClient;
use anyhow::Context;
use api::entities::feeds;
use async_trait::async_trait;
use feed_rs::parser;
use kaleido::background_jobs::worker::TaskProcessor;
use kaleido::background_jobs::{DurableStorage, TaskQueue};
use sea_orm::DatabaseConnection;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;

const FETCH_TIMEOUT: Duration = Duration::from_secs(30);
const PROBE_TIMEOUT: Duration = Duration::from_secs(10);

/// Common URL paths that blogs and CMSes use for their feeds.
pub(crate) const RSS_PATHS: &[&str] = &[
    "/rss",
    "/feed",
    "/atom.xml",
    "/rss.xml",
    "/feed.xml",
    "/feeds",
    "/rss/news",
    "/blog/feed",
    "/blog/rss",
    "/articles/feed",
];

#[derive(Debug, Deserialize)]
struct Payload {
    feed_id: i32,
}

#[derive(Deserialize)]
struct OllamaFeedResult {
    feed_url: Option<String>,
}

pub struct FeedDiscovery {
    db: Arc<DatabaseConnection>,
    http: reqwest::Client,
    probe_http: reqwest::Client,
    ollama: OllamaClient,
}

impl FeedDiscovery {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(FETCH_TIMEOUT)
            .user_agent("rss-reader/1.0")
            .build()
            .expect("Failed to build HTTP client for FeedDiscovery");

        let probe_http = reqwest::Client::builder()
            .timeout(PROBE_TIMEOUT)
            .user_agent("rss-reader/1.0")
            .build()
            .expect("Failed to build probe HTTP client for FeedDiscovery");

        Self {
            db,
            http,
            probe_http,
            ollama: OllamaClient::from_env(),
        }
    }

    /// Run the three-step discovery chain.  Returns the RSS URL if found.
    async fn discover_feed(&self, page_url: &str) -> anyhow::Result<Option<String>> {
        run_discovery(&self.http, &self.probe_http, &self.ollama, page_url).await
    }
}

#[async_trait]
impl TaskProcessor for FeedDiscovery {
    fn task_type(&self) -> &str {
        "feed_discovery"
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
            serde_json::from_value(payload).context("Invalid feed_discovery payload")?;
        let db = self.db.as_ref();

        let feed = feeds::Model::find_by_id(db, p.feed_id)
            .await
            .context("DB error looking up feed")?
            .with_context(|| format!("Feed {} not found", p.feed_id))?;

        tracing::info!(feed_id = p.feed_id, url = %feed.url, "starting feed discovery");

        let page_url = feed.url.clone();

        match self.discover_feed(&page_url).await {
            Ok(Some(rss_url)) => {
                tracing::info!(
                    feed_id = p.feed_id,
                    rss_url = %rss_url,
                    "discovered RSS feed"
                );
                feeds::Model::update_for_discovery(db, p.feed_id, "rss", Some(&rss_url), &page_url)
                    .await
                    .context("Failed to update feed record after discovery")?;

                // Re-verify with the correct RSS URL — verifier will also do initial fetch
                let storage = DurableStorage::new((*self.db).clone());
                let queue = TaskQueue::new(storage);
                queue
                    .enqueue(
                        "feed_verifier".to_string(),
                        serde_json::json!({ "feed_id": p.feed_id }),
                    )
                    .await
                    .context("Failed to enqueue feed_verifier after discovery")?;

                tracing::info!(feed_id = p.feed_id, "enqueued feed_verifier");
            }
            Ok(None) => {
                tracing::info!(
                    feed_id = p.feed_id,
                    "no RSS feed found — marking as scraped"
                );
                feeds::Model::update_for_discovery(db, p.feed_id, "scraped", None, &page_url)
                    .await
                    .context("Failed to mark feed as scraped")?;

                let storage = DurableStorage::new((*self.db).clone());
                let queue = TaskQueue::new(storage);
                queue
                    .enqueue(
                        "page_extractor".to_string(),
                        serde_json::json!({ "feed_id": p.feed_id }),
                    )
                    .await
                    .context("Failed to enqueue page_extractor")?;

                tracing::info!(feed_id = p.feed_id, "enqueued page_extractor");
            }
            Err(e) => {
                return Err(format!("Feed discovery failed for feed {}: {e}", p.feed_id).into());
            }
        }

        Ok(())
    }
}

/// Try to GET `url` and detect whether it serves RSS/Atom content.
pub(crate) async fn probe_rss(http: &reqwest::Client, url: &str) -> anyhow::Result<Option<String>> {
    let resp = match http.get(url).send().await {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };

    if !resp.status().is_success() {
        return Ok(None);
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    if content_type.contains("rss") || content_type.contains("atom") || content_type.contains("xml")
    {
        return Ok(Some(url.to_string()));
    }

    // Content-type was ambiguous — try parsing the body as a feed
    let bytes = resp.bytes().await.unwrap_or_default();
    if parser::parse::<&[u8]>(bytes.as_ref()).is_ok() {
        return Ok(Some(url.to_string()));
    }

    Ok(None)
}

/// Three-step RSS discovery: `<link>` tag → common paths → LLM fallback.
pub(crate) async fn run_discovery(
    http: &reqwest::Client,
    probe_http: &reqwest::Client,
    ollama: &OllamaClient,
    page_url: &str,
) -> anyhow::Result<Option<String>> {
    // fetch the page
    let resp = http
        .get(page_url)
        .send()
        .await
        .context("Failed to fetch page for discovery")?;

    if !resp.status().is_success() {
        return Err(anyhow::anyhow!(
            "Page returned HTTP {}",
            resp.status().as_u16()
        ));
    }

    let html = resp.text().await.context("Failed to read page body")?;

    // <link rel="alternate">
    let links = html_extractor::find_rss_links(&html);
    if let Some(href) = links.into_iter().next() {
        let resolved = resolve_url(page_url, &href)?;
        tracing::info!(url = %resolved, "feed found via <link> tag");
        return Ok(Some(resolved));
    }

    // common path probing
    let origin = base_origin(page_url)?;
    for path in RSS_PATHS {
        let candidate = format!("{origin}{path}");
        if let Ok(Some(url)) = probe_rss(probe_http, &candidate).await {
            tracing::info!(url = %url, "feed found via path probing");
            return Ok(Some(url));
        }
    }

    //  LLM fallback
    let text = html_extractor::html_to_text(&html, 3000);
    if !text.is_empty() {
        let prompt = format!(
            "You are helping find an RSS or Atom feed URL for a website.\n\
             Here is the text content of the page at {page_url}:\n\n{text}\n\n\
             If you can identify a URL for an RSS or Atom feed, return JSON:\n\
             {{\"feed_url\": \"https://...\"}}\
\n\
             If no feed URL is found, return:\n\
             {{\"feed_url\": null}}\n\
             Return only valid JSON, nothing else."
        );

        match ollama.generate(&prompt).await {
            Ok(response) => match serde_json::from_str::<OllamaFeedResult>(&response) {
                Ok(result) => {
                    if let Some(url) = result.feed_url.filter(|u| !u.is_empty()) {
                        let resolved = resolve_url(page_url, &url)?;
                        tracing::info!(url = %resolved, "feed found via LLM");
                        return Ok(Some(resolved));
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to parse LLM response as JSON: {e}");
                }
            },
            Err(e) => {
                tracing::warn!("Ollama unavailable during discovery: {e}");
            }
        }
    }

    Ok(None)
}

fn base_origin(url: &str) -> anyhow::Result<String> {
    let parsed = url::Url::parse(url).context("Invalid URL")?;
    let host = parsed.host_str().unwrap_or("");
    match parsed.port() {
        Some(port) => Ok(format!("{}://{}:{}", parsed.scheme(), host, port)),
        None => Ok(format!("{}://{}", parsed.scheme(), host)),
    }
}

fn resolve_url(base: &str, href: &str) -> anyhow::Result<String> {
    if href.starts_with("http://") || href.starts_with("https://") {
        return Ok(href.to_string());
    }
    let base_url = url::Url::parse(base).context("Invalid base URL")?;
    let resolved = base_url
        .join(href)
        .context("Failed to resolve relative URL")?;
    Ok(resolved.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ollama::OllamaClient;
    use crate::test_fixtures::{MINIMAL_ATOM, MINIMAL_RSS};
    use std::time::Duration;

    fn http(timeout_secs: u64) -> reqwest::Client {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(timeout_secs))
            .build()
            .unwrap()
    }

    #[tokio::test]
    async fn probe_rss_returns_url_for_rss_content_type() {
        let mut srv = mockito::Server::new_async().await;
        srv.mock("GET", "/feed.xml")
            .with_status(200)
            .with_header("content-type", "application/rss+xml")
            .with_body(MINIMAL_RSS)
            .create_async()
            .await;

        let result = probe_rss(&http(5), &format!("{}/feed.xml", srv.url()))
            .await
            .unwrap();
        assert!(result.is_some());
    }

    #[tokio::test]
    async fn probe_rss_returns_url_for_atom_content_type() {
        let mut srv = mockito::Server::new_async().await;
        srv.mock("GET", "/atom")
            .with_status(200)
            .with_header("content-type", "application/atom+xml")
            .with_body(MINIMAL_ATOM)
            .create_async()
            .await;

        let result = probe_rss(&http(5), &format!("{}/atom", srv.url()))
            .await
            .unwrap();
        assert!(result.is_some());
    }

    #[tokio::test]
    async fn probe_rss_parses_feed_body_when_content_type_is_html() {
        let mut srv = mockito::Server::new_async().await;
        srv.mock("GET", "/feed")
            .with_status(200)
            .with_header("content-type", "text/html")
            .with_body(MINIMAL_RSS)
            .create_async()
            .await;

        let result = probe_rss(&http(5), &format!("{}/feed", srv.url()))
            .await
            .unwrap();
        assert!(
            result.is_some(),
            "should detect RSS even with wrong content-type"
        );
    }

    #[tokio::test]
    async fn probe_rss_returns_none_for_404() {
        let mut srv = mockito::Server::new_async().await;
        srv.mock("GET", "/nope")
            .with_status(404)
            .create_async()
            .await;

        let result = probe_rss(&http(5), &format!("{}/nope", srv.url()))
            .await
            .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn probe_rss_returns_none_for_html_body() {
        let mut srv = mockito::Server::new_async().await;
        srv.mock("GET", "/page")
            .with_status(200)
            .with_header("content-type", "text/html")
            .with_body("<html><body><p>Just a webpage</p></body></html>")
            .create_async()
            .await;

        let result = probe_rss(&http(5), &format!("{}/page", srv.url()))
            .await
            .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn discover_finds_rss_via_link_alternate_tag() {
        let mut srv = mockito::Server::new_async().await;
        let feed_url = format!("{}/feed.xml", srv.url());
        let page_html = format!(
            r#"<html><head><link rel="alternate" type="application/rss+xml" href="{feed_url}" /></head><body><p>Blog</p></body></html>"#
        );
        srv.mock("GET", "/")
            .with_status(200)
            .with_body(page_html)
            .create_async()
            .await;

        let ollama = OllamaClient::new("http://127.0.0.1:19999".to_string()); // unused
        let result = run_discovery(&http(5), &http(2), &ollama, &format!("{}/", srv.url()))
            .await
            .unwrap();
        assert!(result.is_some());
        assert!(result.unwrap().contains("/feed.xml"));
    }

    #[tokio::test]
    async fn discover_finds_rss_via_path_probing() {
        let mut srv = mockito::Server::new_async().await;
        // Main page — no <link> tag
        srv.mock("GET", "/")
            .with_status(200)
            .with_body("<html><body><p>A blog</p></body></html>")
            .create_async()
            .await;
        // /rss serves a valid feed
        srv.mock("GET", "/rss")
            .with_status(200)
            .with_header("content-type", "application/rss+xml")
            .with_body(MINIMAL_RSS)
            .create_async()
            .await;

        let ollama = OllamaClient::new("http://127.0.0.1:19999".to_string());
        let result = run_discovery(&http(5), &http(2), &ollama, &format!("{}/", srv.url()))
            .await
            .unwrap();
        assert!(result.is_some(), "Should detect feed via /rss path probe");
    }

    #[tokio::test]
    async fn discover_falls_back_to_llm_when_paths_fail() {
        let mut page_srv = mockito::Server::new_async().await;
        let mut ollama_srv = mockito::Server::new_async().await;

        let feed_url = format!("{}/found-feed.xml", page_srv.url());

        page_srv
            .mock("GET", "/blog")
            .with_status(200)
            .with_body("<html><body><p>Tech blog about Rust programming</p></body></html>")
            .create_async()
            .await;

        for path in RSS_PATHS {
            page_srv
                .mock("GET", *path)
                .with_status(404)
                .create_async()
                .await;
        }

        let ollama_body = format!(r#"{{"response":"{{\"feed_url\":\"{feed_url}\"}}"}}"#);
        ollama_srv
            .mock("POST", "/api/generate")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(ollama_body)
            .create_async()
            .await;

        let ollama = OllamaClient::new(ollama_srv.url());
        let result = run_discovery(
            &http(5),
            &http(2),
            &ollama,
            &format!("{}/blog", page_srv.url()),
        )
        .await
        .unwrap();
        assert!(result.is_some(), "LLM fallback should return a feed URL");
    }

    #[tokio::test]
    async fn discover_returns_none_when_all_steps_fail() {
        let mut page_srv = mockito::Server::new_async().await;
        let mut ollama_srv = mockito::Server::new_async().await;

        page_srv
            .mock("GET", "/no-feeds")
            .with_status(200)
            .with_body("<html><body><p>Dashboard software with no articles.</p></body></html>")
            .create_async()
            .await;

        for path in RSS_PATHS {
            page_srv
                .mock("GET", *path)
                .with_status(404)
                .create_async()
                .await;
        }

        ollama_srv
            .mock("POST", "/api/generate")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"response":"{\"feed_url\":null}"}"#)
            .create_async()
            .await;

        let ollama = OllamaClient::new(ollama_srv.url());
        let result = run_discovery(
            &http(5),
            &http(2),
            &ollama,
            &format!("{}/no-feeds", page_srv.url()),
        )
        .await
        .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn discover_handles_llm_unavailable_gracefully() {
        let mut page_srv = mockito::Server::new_async().await;

        page_srv
            .mock("GET", "/")
            .with_status(200)
            .with_body("<html><body><p>A page.</p></body></html>")
            .create_async()
            .await;

        for path in RSS_PATHS {
            page_srv
                .mock("GET", *path)
                .with_status(404)
                .create_async()
                .await;
        }

        let ollama = OllamaClient::new("http://127.0.0.1:19999".to_string());
        let result = run_discovery(&http(5), &http(2), &ollama, &format!("{}/", page_srv.url()))
            .await
            .unwrap();
        assert!(result.is_none());
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use crate::ollama::OllamaClient;
    use crate::test_fixtures::MINIMAL_RSS;
    use std::time::Duration;

    fn http(timeout_secs: u64) -> reqwest::Client {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(timeout_secs))
            .build()
            .unwrap()
    }

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

    #[tokio::test]
    #[ignore = "requires running compose stack (docker compose up)"]
    async fn integration_discover_via_link_tag_no_llm() {
        let mut srv = mockito::Server::new_async().await;
        let feed_url = format!("{}/feed.xml", srv.url());
        let page_html = format!(
            r#"<html><head><link rel="alternate" type="application/rss+xml" href="{feed_url}" /></head><body><p>Blog</p></body></html>"#
        );
        srv.mock("GET", "/")
            .with_status(200)
            .with_body(page_html)
            .create_async()
            .await;
        srv.mock("GET", "/feed.xml")
            .with_status(200)
            .with_header("content-type", "application/rss+xml")
            .with_body(MINIMAL_RSS)
            .create_async()
            .await;

        let ollama = OllamaClient::from_env();
        let result = run_discovery(&http(10), &http(5), &ollama, &format!("{}/", srv.url()))
            .await
            .unwrap();
        assert!(result.is_some(), "Should find feed via <link> tag");
        println!("Discovered RSS URL: {}", result.unwrap());
    }

    #[tokio::test]
    #[ignore = "requires running compose stack with Ollama (docker compose up)"]
    async fn integration_discover_llm_fallback_with_real_ollama() {
        if !ollama_available().await {
            eprintln!("skip: Ollama not reachable");
            return;
        }

        let mut page_srv = mockito::Server::new_async().await;
        page_srv
            .mock("GET", "/")
            .with_status(200)
            .with_body(crate::test_fixtures::BLOG_LISTING_CLEAR)
            .create_async()
            .await;
        for path in RSS_PATHS {
            page_srv
                .mock("GET", *path)
                .with_status(404)
                .create_async()
                .await;
        }

        let ollama = OllamaClient::from_env();
        let result = run_discovery(
            &http(10),
            &http(5),
            &ollama,
            &format!("{}/", page_srv.url()),
        )
        .await;

        match result {
            Ok(Some(url)) => println!("LLM returned feed URL: {url}"),
            Ok(None) => println!("LLM correctly found no feed"),
            Err(e) => panic!("Unexpected error: {e}"),
        }
    }

    #[tokio::test]
    #[ignore = "requires running compose stack with Ollama (docker compose up)"]
    async fn integration_discover_confusing_page_no_feed() {
        if !ollama_available().await {
            eprintln!("skip: Ollama not reachable");
            return;
        }

        let mut page_srv = mockito::Server::new_async().await;
        page_srv
            .mock("GET", "/")
            .with_status(200)
            .with_body(crate::test_fixtures::CONFUSING_PAGE_NO_ARTICLES)
            .create_async()
            .await;
        for path in RSS_PATHS {
            page_srv
                .mock("GET", *path)
                .with_status(404)
                .create_async()
                .await;
        }

        let ollama = OllamaClient::from_env();
        let result = run_discovery(
            &http(10),
            &http(5),
            &ollama,
            &format!("{}/", page_srv.url()),
        )
        .await;

        assert!(result.is_ok(), "Should not error on confusing page");
        println!("Result for confusing page: {:?}", result.unwrap());
    }
}
