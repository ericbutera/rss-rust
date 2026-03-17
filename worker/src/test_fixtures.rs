//! HTML / RSS fixtures shared across unit and integration tests.

/// A clean tech-blog listing page with three clearly structured articles.
/// Each article is in an `<article>` element with an `<h2>` + anchor link, a
/// byline, and a short excerpt — the ideal input for the LLM article extractor.
pub const BLOG_LISTING_CLEAR: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>The Rust Times – Latest Articles</title>
  <meta name="description" content="Engineering insights for Rustaceans" />
</head>
<body>
  <header>
    <h1>The Rust Times</h1>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
      <a href="/archive">Archive</a>
    </nav>
  </header>
  <main>
    <article>
      <h2><a href="https://example.com/posts/async-rust-2026">Async Rust in 2026: What Changed</a></h2>
      <p class="meta">by Alice Johnson · March 14, 2026</p>
      <p>A deep dive into the async runtime improvements that landed in the Rust 2026 edition, including revamped task scheduling and cooperative multitasking primitives.</p>
      <a href="https://example.com/posts/async-rust-2026">Read more →</a>
    </article>
    <article>
      <h2><a href="https://example.com/posts/memory-safety-without-gc">Memory Safety Without a GC</a></h2>
      <p class="meta">by Bob Smith · March 12, 2026</p>
      <p>How Rust's ownership model steadily replaced garbage-collected runtimes in systems programming. We compare performance benchmarks and developer experience.</p>
      <a href="https://example.com/posts/memory-safety-without-gc">Read more →</a>
    </article>
    <article>
      <h2><a href="https://example.com/posts/trait-objects-vs-generics">Trait Objects vs Generics: A Performance Comparison</a></h2>
      <p class="meta">by Carol White · March 10, 2026</p>
      <p>Dynamic dispatch with dyn Trait vs. monomorphised generics: when does the vtable overhead actually matter, and when should you reach for Box&lt;dyn Trait&gt;?</p>
      <a href="https://example.com/posts/trait-objects-vs-generics">Read more →</a>
    </article>
  </main>
  <footer><p>© 2026 The Rust Times</p></footer>
</body>
</html>"#;

/// A fully-populated article page with Open Graph meta tags and a rich
/// `<article>` body.  Used to test that the extractor populates all fields.
pub const ARTICLE_WITH_OG_TAGS: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Async Rust in 2026: What Changed – The Rust Times</title>
  <meta property="og:title" content="Async Rust in 2026: What Changed" />
  <meta property="og:description" content="A deep dive into the async runtime improvements that landed in the Rust 2026 edition." />
  <meta property="og:image" content="https://example.com/images/async-rust-2026.jpg" />
  <meta property="og:url" content="https://example.com/posts/async-rust-2026" />
</head>
<body>
  <article>
    <h1>Async Rust in 2026: What Changed</h1>
    <p class="byline">Alice Johnson · March 14, 2026 · 12 min read</p>
    <p>The Rust 2026 edition brought sweeping improvements to the async ecosystem. From the stabilisation of async closures to the revised wake protocol in the core executor interface, the changes are worth understanding in depth.</p>
    <p>Tokio 3.0, released alongside the edition, now exposes cooperative yield points at every await, making it much harder to accidentally starve the scheduler.</p>
    <p>The async-std project has officially merged into smol, creating a unified lightweight alternative for use cases that do not need Tokio's full feature surface.</p>
    <p>For embedded developers, embassy now ships a HAL generator that outputs correct async peripheral drivers from a device-tree description, cutting the time to bring up new hardware from weeks to hours.</p>
    <p>Perhaps the most exciting stabilisation is the AsyncIterator trait, which finally landed in std after several trait-solver overhauls. Combined with the new for-await syntax sugar, writing async pipelines now reads as cleanly as synchronous code.</p>
  </article>
</body>
</html>"#;

/// A SaaS marketing-dashboard page that looks plausible but contains no
/// editorial articles — only campaign records, alert links, and nav items.
/// Tests that the extractor and LLM handle "almost looks like articles" pages
/// gracefully rather than returning garbage links.
pub const CONFUSING_PAGE_NO_ARTICLES: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>DataPulse — Campaign Activity</title>
  <meta name="description" content="Monitor your marketing campaign performance in real time." />
</head>
<body>
  <header>
    <h1>DataPulse</h1>
    <nav>
      <a href="/dashboard">Dashboard</a>
      <a href="/campaigns">Campaigns</a>
      <a href="/audience">Audience</a>
      <a href="/reports">Reports</a>
      <a href="/settings">Settings</a>
    </nav>
  </header>
  <main>
    <section class="summary">
      <h2>Activity Overview</h2>
      <p>Total impressions this week: <strong>1,482,033</strong></p>
      <p>Click-through rate: <strong>3.4%</strong> (↑ 0.2% vs. last week)</p>
      <p>Active campaigns: <strong>12</strong> · Paused: <strong>3</strong></p>
    </section>
    <section class="recent-activity">
      <h2>Recent Campaign Events</h2>
      <table>
        <thead><tr><th>Campaign</th><th>Event</th><th>Time</th></tr></thead>
        <tbody>
          <tr>
            <td><a href="/campaigns/8821/overview">Spring Promo Q1</a></td>
            <td>Budget threshold reached (90%)</td>
            <td>2 min ago</td>
          </tr>
          <tr>
            <td><a href="/campaigns/8805/overview">Brand Awareness EU</a></td>
            <td>A/B variant B outperforming A by 18%</td>
            <td>15 min ago</td>
          </tr>
          <tr>
            <td><a href="/campaigns/8798/overview">Retargeting – Cart Abandoners</a></td>
            <td>Creative rotation applied</td>
            <td>1 hr ago</td>
          </tr>
        </tbody>
      </table>
    </section>
    <section class="alerts">
      <h3>System Alerts</h3>
      <ul>
        <li><a href="/alerts/403">Pixel validation failed on checkout page</a> – review needed</li>
        <li><a href="/alerts/401">API rate limit warning: 78% of daily quota used</a></li>
      </ul>
    </section>
  </main>
  <footer>
    <p>DataPulse Analytics Platform — <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></p>
  </footer>
</body>
</html>"#;

/// Minimal valid RSS 2.0 feed — used to verify feed-detection probing.
pub const MINIMAL_RSS: &[u8] = br#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Test Article</title>
      <link>https://example.com/test-article</link>
      <description>Test article description text.</description>
      <guid>https://example.com/test-article</guid>
    </item>
  </channel>
</rss>"#;

/// Minimal valid Atom feed.
pub const MINIMAL_ATOM: &[u8] = br#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test Feed</title>
  <entry>
    <id>https://example.com/atom-1</id>
    <title>Atom Entry</title>
    <link href="https://example.com/atom-1"/>
    <summary>Atom entry summary text.</summary>
  </entry>
</feed>"#;
