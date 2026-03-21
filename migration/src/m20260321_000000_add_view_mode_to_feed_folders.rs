use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(Iden)]
enum FeedFolders {
    Table,
    ViewMode,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(FeedFolders::Table)
                    .add_column(
                        ColumnDef::new(FeedFolders::ViewMode)
                            .string()
                            .not_null()
                            .default("list"),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(FeedFolders::Table)
                    .drop_column(FeedFolders::ViewMode)
                    .to_owned(),
            )
            .await
    }
}
