//! HTML parsing utilities shared by the feed-discovery and page-extraction pipelines.
//!
//! Three public entry points:
//! - [`find_rss_links`]  — extract `<link rel="alternate">` feed URLs
//! - [`html_to_text`]   — strip HTML to plain text for LLM prompts
//! - [`extract_article`] — pull structured metadata from an article page

use scraper::{Html, Selector};

// ── Feed link discovery ───────────────────────────────────────────────────────

/// Return all RSS/Atom feed URLs declared via `<link rel="alternate">` in the
/// document `<head>`.  Relative hrefs are returned as-is; callers must resolve
/// them against the page base URL.
pub fn find_rss_links(html: &str) -> Vec<String> {
    let doc = Html::parse_document(html);
    let Ok(sel) = Selector::parse("link[rel='alternate']") else {
        return vec![];
    };

    doc.select(&sel)
        .filter(|e| {
            let t = e.value().attr("type").unwrap_or("");
            t == "application/rss+xml" || t == "application/atom+xml"
        })
        .filter_map(|e| e.value().attr("href").map(|h| h.to_string()))
        .collect()
}

// ── Text extraction for LLM ───────────────────────────────────────────────────

/// Strip an HTML document down to plain text suitable for an LLM prompt.
///
/// Collects text from paragraphs, headings, and list items; joins with spaces;
/// truncates to `max_chars`.  Script/style content is not included because
/// `<script>` / `<style>` elements contain no text nodes worth sending.
pub fn html_to_text(html: &str, max_chars: usize) -> String {
    let doc = Html::parse_document(html);
    let Ok(sel) = Selector::parse("p, h1, h2, h3, h4, li") else {
        return String::new();
    };

    let text = doc
        .select(&sel)
        .flat_map(|e| e.text())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    text.chars().take(max_chars).collect()
}

// ── Article content extraction ────────────────────────────────────────────────

pub struct ExtractedArticle {
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub content: Option<String>,
    pub preview: Option<String>,
}

/// Extract structured metadata from an article page using Open Graph tags and
/// content heuristics.
///
/// Priority order:
/// - **title**: `og:title` → first `<h1>` → `<title>`
/// - **description**: `og:description` → first 300 chars of content
/// - **image_url**: `og:image`
/// - **content**: text from `<article>` → `<main>` → `<body>`
/// - **preview**: first 300 characters of content
pub fn extract_article(html: &str) -> ExtractedArticle {
    let doc = Html::parse_document(html);

    let og_title = meta_property(&doc, "og:title");
    let og_desc = meta_property(&doc, "og:description");
    let og_image = meta_property(&doc, "og:image");

    let title = og_title
        .or_else(|| select_first_text(&doc, "h1"))
        .or_else(|| select_first_text(&doc, "title"));

    // Prefer <article>, fall back to <main>, then <body>
    let content_text = ["article", "main", "body"].iter().find_map(|sel_str| {
        let sel = Selector::parse(sel_str).ok()?;
        let text = doc
            .select(&sel)
            .next()?
            .text()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        if text.len() > 100 {
            Some(text)
        } else {
            None
        }
    });

    let preview = content_text
        .as_deref()
        .map(|t| t.chars().take(300).collect::<String>());

    let description = og_desc.or_else(|| preview.clone());

    ExtractedArticle {
        title,
        description,
        image_url: og_image,
        content: content_text,
        preview,
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn meta_property(doc: &Html, property: &str) -> Option<String> {
    let sel_str = format!("meta[property='{property}']");
    let sel = Selector::parse(&sel_str).ok()?;
    doc.select(&sel)
        .next()
        .and_then(|e| e.value().attr("content"))
        .map(|s| s.to_string())
}

fn select_first_text(doc: &Html, selector: &str) -> Option<String> {
    let sel = Selector::parse(selector).ok()?;
    let text: String = doc
        .select(&sel)
        .next()?
        .text()
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::{ARTICLE_WITH_OG_TAGS, BLOG_LISTING_CLEAR};

    // ── find_rss_links ────────────────────────────────────────────────────────

    #[test]
    fn find_rss_links_returns_rss_href() {
        let html = r#"<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml" /></head><body/></html>"#;
        let links = find_rss_links(html);
        assert_eq!(links, vec!["/feed.xml"]);
    }

    #[test]
    fn find_rss_links_returns_atom_href() {
        let html = r#"<html><head><link rel="alternate" type="application/atom+xml" href="/atom" /></head><body/></html>"#;
        let links = find_rss_links(html);
        assert_eq!(links, vec!["/atom"]);
    }

    #[test]
    fn find_rss_links_ignores_stylesheet_links() {
        let html = r#"<html><head><link rel="stylesheet" href="/style.css" /><link rel="alternate" type="application/rss+xml" href="/feed" /></head><body/></html>"#;
        let links = find_rss_links(html);
        assert_eq!(links, vec!["/feed"]);
    }

    #[test]
    fn find_rss_links_returns_multiple() {
        let html = r#"<html><head><link rel="alternate" type="application/rss+xml" href="/rss" /><link rel="alternate" type="application/atom+xml" href="/atom" /></head><body/></html>"#;
        let links = find_rss_links(html);
        assert_eq!(links.len(), 2);
    }

    #[test]
    fn find_rss_links_returns_empty_for_no_link_tags() {
        let links = find_rss_links(BLOG_LISTING_CLEAR);
        assert!(links.is_empty());
    }

    // ── html_to_text ──────────────────────────────────────────────────────────

    #[test]
    fn html_to_text_extracts_paragraph_content() {
        let html = "<html><body><p>Hello world</p></body></html>";
        let text = html_to_text(html, 1000);
        assert!(text.contains("Hello world"));
    }

    #[test]
    fn html_to_text_truncates_at_max_chars() {
        let long_body = "a".repeat(5000);
        let html = format!("<html><body><p>{long_body}</p></body></html>");
        let text = html_to_text(&html, 100);
        assert_eq!(text.chars().count(), 100);
    }

    #[test]
    fn html_to_text_extracts_headings() {
        let html = "<html><body><h2>My Heading</h2><p>Body text</p></body></html>";
        let text = html_to_text(html, 1000);
        assert!(text.contains("My Heading"));
        assert!(text.contains("Body text"));
    }

    #[test]
    fn html_to_text_returns_empty_for_no_content_elements() {
        let html = "<html><head></head><body></body></html>";
        let text = html_to_text(html, 1000);
        assert!(text.is_empty());
    }

    // ── extract_article ───────────────────────────────────────────────────────

    #[test]
    fn extract_article_reads_og_tags() {
        let article = extract_article(ARTICLE_WITH_OG_TAGS);
        assert_eq!(
            article.title.as_deref(),
            Some("Async Rust in 2026: What Changed")
        );
        assert!(article
            .description
            .as_deref()
            .unwrap_or("")
            .contains("async runtime"));
        assert_eq!(
            article.image_url.as_deref(),
            Some("https://example.com/images/async-rust-2026.jpg")
        );
    }

    #[test]
    fn extract_article_falls_back_to_h1_when_no_og_title() {
        let html = r#"<html><body><article><h1>My Article Title</h1><p>Some content here that is long enough to pass the threshold.</p></article></body></html>"#;
        let article = extract_article(html);
        assert_eq!(article.title.as_deref(), Some("My Article Title"));
    }

    #[test]
    fn extract_article_generates_preview_from_content() {
        let article = extract_article(ARTICLE_WITH_OG_TAGS);
        assert!(article.preview.is_some());
        let preview = article.preview.unwrap();
        assert!(preview.chars().count() <= 300);
    }

    #[test]
    fn extract_article_content_is_populated_from_article_tag() {
        let article = extract_article(ARTICLE_WITH_OG_TAGS);
        assert!(article.content.is_some());
        assert!(article.content.unwrap().len() > 100);
    }
}
