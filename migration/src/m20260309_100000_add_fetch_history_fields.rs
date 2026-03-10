use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(Iden)]
enum FetchHistory {
    Table,
    ErrorMessage,
    ContentLength,
    ArticleCount,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(FetchHistory::Table)
                    .add_column(ColumnDef::new(FetchHistory::ErrorMessage).string().null())
                    .add_column(
                        ColumnDef::new(FetchHistory::ContentLength)
                            .big_integer()
                            .null(),
                    )
                    .add_column(ColumnDef::new(FetchHistory::ArticleCount).integer().null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(FetchHistory::Table)
                    .drop_column(FetchHistory::ErrorMessage)
                    .drop_column(FetchHistory::ContentLength)
                    .drop_column(FetchHistory::ArticleCount)
                    .to_owned(),
            )
            .await
    }
}
