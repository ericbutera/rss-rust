use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(Iden)]
enum UserFeeds {
    Table,
    ViewMode,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(UserFeeds::Table)
                    .add_column(
                        ColumnDef::new(UserFeeds::ViewMode)
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
                    .table(UserFeeds::Table)
                    .drop_column(UserFeeds::ViewMode)
                    .to_owned(),
            )
            .await
    }
}
