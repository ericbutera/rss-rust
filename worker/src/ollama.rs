//! Minimal Ollama API client.
//!
//! Wraps `POST /api/generate` with `stream: false` and `format: "json"` so
//! the model is forced to return valid JSON.  All LLM calls in this codebase
//! go through [`OllamaClient::generate`].

use anyhow::Context;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const OLLAMA_TIMEOUT: Duration = Duration::from_secs(120);
pub const MODEL: &str = "qwen2.5:3b";

#[derive(Serialize)]
struct GenerateRequest<'a> {
    model: &'a str,
    prompt: &'a str,
    stream: bool,
    format: &'a str,
}

#[derive(Deserialize)]
struct GenerateResponse {
    response: String,
}

pub struct OllamaClient {
    http: Client,
    base_url: String,
}

impl OllamaClient {
    pub fn new(base_url: String) -> Self {
        let http = Client::builder()
            .timeout(OLLAMA_TIMEOUT)
            .user_agent("rss-reader/1.0")
            .build()
            .expect("Failed to build Ollama HTTP client");
        Self { http, base_url }
    }

    /// Build a client using the `OLLAMA_URL` env var (defaults to `http://ollama:11434`).
    pub fn from_env() -> Self {
        let base_url = std::env::var("OLLAMA_URL")
            .unwrap_or_else(|_| "http://ollama:11434".to_string());
        Self::new(base_url)
    }

    /// Send a prompt and return the model's JSON-mode response string.
    pub async fn generate(&self, prompt: &str) -> anyhow::Result<String> {
        let body = GenerateRequest {
            model: MODEL,
            prompt,
            stream: false,
            format: "json",
        };

        let resp = self
            .http
            .post(format!("{}/api/generate", self.base_url))
            .json(&body)
            .send()
            .await
            .context("Ollama HTTP request failed")?;

        if !resp.status().is_success() {
            return Err(anyhow::anyhow!(
                "Ollama returned HTTP {}",
                resp.status().as_u16()
            ));
        }

        let parsed: GenerateResponse = resp
            .json()
            .await
            .context("Failed to parse Ollama response body")?;

        Ok(parsed.response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn generate_returns_response_field_on_success() {
        let mut srv = mockito::Server::new_async().await;
        srv.mock("POST", "/api/generate")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"response":"{\"feed_url\":null}","done":true}"#)
            .create_async()
            .await;

        let client = OllamaClient::new(srv.url());
        let result = client.generate("Find the feed URL").await.unwrap();
        assert_eq!(result, r#"{"feed_url":null}"#);
    }

    #[tokio::test]
    async fn generate_errors_on_http_500() {
        let mut srv = mockito::Server::new_async().await;
        srv.mock("POST", "/api/generate")
            .with_status(500)
            .create_async()
            .await;

        let client = OllamaClient::new(srv.url());
        let result = client.generate("prompt").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("500"));
    }

    #[tokio::test]
    async fn generate_errors_on_missing_response_field() {
        let mut srv = mockito::Server::new_async().await;
        srv.mock("POST", "/api/generate")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"not_response":"value"}"#)
            .create_async()
            .await;

        let client = OllamaClient::new(srv.url());
        let result = client.generate("prompt").await;
        assert!(result.is_err(), "Missing 'response' field should cause an error");
    }

    #[tokio::test]
    async fn generate_sends_correct_model_and_format() {
        let mut srv = mockito::Server::new_async().await;
        srv.mock("POST", "/api/generate")
            .match_body(mockito::Matcher::PartialJson(serde_json::json!({
                "model": MODEL,
                "stream": false,
                "format": "json"
            })))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"response":"ok","done":true}"#)
            .create_async()
            .await;

        let client = OllamaClient::new(srv.url());
        let result = client.generate("anything").await.unwrap();
        assert_eq!(result, "ok");
    }
}
