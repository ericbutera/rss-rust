pub use sea_orm_migration::prelude::*;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        let mut migrations = kaleido_migrations::external_migrations();
        migrations.sort_by_key(|m| m.name().to_string());
        migrations
    }
}

/*
TODO: migrations

Feeds
id
url
url_hash
name
created_at
updated_at
verified_at
deactivated_at
created_by

Articles
id
feed_id
url
title
description
image_url
preview
content
guid

UserFeeds
user_id
feed_id
all_articles_read_at

UserArticles
user_id
article_id
viewed_at

FetchHistory
id
feed_id
status_code
etag

*/
