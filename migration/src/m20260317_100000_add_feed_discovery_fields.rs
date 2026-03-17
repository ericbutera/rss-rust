use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(Iden)]
enum Feeds {
    Table,
    FeedType,
    SourceUrl,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add feed_type column: "rss" (default) or "scraped"
        manager
            .alter_table(
                Table::alter()
                    .table(Feeds::Table)
                    .add_column(
                        ColumnDef::new(Feeds::FeedType)
                            .string()
                            .not_null()
                            .default("rss"),
                    )
                    .to_owned(),
            )
            .await?;

        // Add source_url: original page URL before RSS discovery repoints feed.url
        manager
            .alter_table(
                Table::alter()
                    .table(Feeds::Table)
                    .add_column(ColumnDef::new(Feeds::SourceUrl).string().null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Feeds::Table)
                    .drop_column(Feeds::SourceUrl)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Feeds::Table)
                    .drop_column(Feeds::FeedType)
                    .to_owned(),
            )
            .await
    }
}
