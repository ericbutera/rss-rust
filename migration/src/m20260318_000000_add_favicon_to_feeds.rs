use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(Iden)]
enum Feeds {
    Table,
    FaviconUrl,
    FaviconFetchedAt,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // URL path where the favicon is served (e.g. /api/favicons/feed_1.ico)
        manager
            .alter_table(
                Table::alter()
                    .table(Feeds::Table)
                    .add_column(ColumnDef::new(Feeds::FaviconUrl).string().null())
                    .to_owned(),
            )
            .await?;

        // When a favicon fetch was last attempted; NULL = never tried.
        // Set this BEFORE the fetch attempt to act as a soft lock and prevent
        // concurrent workers from re-fetching the same favicon.
        manager
            .alter_table(
                Table::alter()
                    .table(Feeds::Table)
                    .add_column(
                        ColumnDef::new(Feeds::FaviconFetchedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Feeds::Table)
                    .drop_column(Feeds::FaviconFetchedAt)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Feeds::Table)
                    .drop_column(Feeds::FaviconUrl)
                    .to_owned(),
            )
            .await
    }
}
