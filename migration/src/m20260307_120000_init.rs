use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(Iden)]
enum Feeds {
    Table,
    Id,
    Url,
    UrlHash,
    Name,
    CreatedAt,
    UpdatedAt,
    VerifiedAt,
    DeactivatedAt,
    CreatedBy,
}

#[derive(Iden)]
enum Articles {
    Table,
    Id,
    FeedId,
    Url,
    Title,
    Description,
    ImageUrl,
    Preview,
    Content,
    Guid,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum UserFeeds {
    Table,
    UserId,
    FeedId,
    AllArticlesReadAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum UserArticles {
    Table,
    UserId,
    ArticleId,
    ViewedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum FetchHistory {
    Table,
    Id,
    FeedId,
    StatusCode,
    Etag,
    CreatedAt,
    UpdatedAt,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Feeds
        manager
            .create_table(
                Table::create()
                    .table(Feeds::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Feeds::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Feeds::Url).string().not_null())
                    .col(ColumnDef::new(Feeds::UrlHash).string().not_null())
                    .col(ColumnDef::new(Feeds::Name).string().null())
                    .col(
                        ColumnDef::new(Feeds::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .col(
                        ColumnDef::new(Feeds::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .col(
                        ColumnDef::new(Feeds::VerifiedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(Feeds::DeactivatedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(ColumnDef::new(Feeds::CreatedBy).integer().null())
                    .to_owned(),
            )
            .await?;

        // create index for feeds.url_hash
        manager
            .create_index(
                Index::create()
                    .name("idx_feeds_url_hash")
                    .table(Feeds::Table)
                    .col(Feeds::UrlHash)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // Articles
        manager
            .create_table(
                Table::create()
                    .table(Articles::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Articles::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Articles::FeedId).integer().not_null())
                    .col(ColumnDef::new(Articles::Url).string().not_null())
                    .col(ColumnDef::new(Articles::Title).string().null())
                    .col(ColumnDef::new(Articles::Description).text().null())
                    .col(ColumnDef::new(Articles::ImageUrl).string().null())
                    .col(ColumnDef::new(Articles::Preview).text().null())
                    .col(ColumnDef::new(Articles::Content).text().null())
                    .col(ColumnDef::new(Articles::Guid).string().null())
                    .col(
                        ColumnDef::new(Articles::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .col(
                        ColumnDef::new(Articles::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Articles::Table, Articles::FeedId)
                            .to(Feeds::Table, Feeds::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // indexes for articles
        manager
            .create_index(
                Index::create()
                    .name("idx_articles_guid")
                    .table(Articles::Table)
                    .col(Articles::Guid)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_articles_url")
                    .table(Articles::Table)
                    .col(Articles::Url)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // UserFeeds (composite primary key user_id + feed_id)
        manager
            .create_table(
                Table::create()
                    .table(UserFeeds::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(UserFeeds::UserId).integer().not_null())
                    .col(ColumnDef::new(UserFeeds::FeedId).integer().not_null())
                    .col(
                        ColumnDef::new(UserFeeds::AllArticlesReadAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(UserFeeds::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .col(
                        ColumnDef::new(UserFeeds::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .primary_key(
                        Index::create()
                            .col(UserFeeds::UserId)
                            .col(UserFeeds::FeedId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(UserFeeds::Table, UserFeeds::FeedId)
                            .to(Feeds::Table, Feeds::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // UserArticles (composite primary key user_id + article_id)
        manager
            .create_table(
                Table::create()
                    .table(UserArticles::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(UserArticles::UserId).integer().not_null())
                    .col(ColumnDef::new(UserArticles::ArticleId).integer().not_null())
                    .col(
                        ColumnDef::new(UserArticles::ViewedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(UserArticles::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .col(
                        ColumnDef::new(UserArticles::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .primary_key(
                        Index::create()
                            .col(UserArticles::UserId)
                            .col(UserArticles::ArticleId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(UserArticles::Table, UserArticles::ArticleId)
                            .to(Articles::Table, Articles::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // FetchHistory
        manager
            .create_table(
                Table::create()
                    .table(FetchHistory::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(FetchHistory::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(FetchHistory::FeedId).integer().not_null())
                    .col(ColumnDef::new(FetchHistory::StatusCode).integer().null())
                    .col(ColumnDef::new(FetchHistory::Etag).string().null())
                    .col(
                        ColumnDef::new(FetchHistory::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .col(
                        ColumnDef::new(FetchHistory::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(FetchHistory::Table, FetchHistory::FeedId)
                            .to(Feeds::Table, Feeds::Id),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(FetchHistory::Table).to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table(UserArticles::Table).to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table(UserFeeds::Table).to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table(Articles::Table).to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table(Feeds::Table).to_owned())
            .await?;

        Ok(())
    }
}
