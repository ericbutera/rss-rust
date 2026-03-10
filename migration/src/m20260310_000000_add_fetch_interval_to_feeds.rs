use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(Iden)]
enum Feeds {
    Table,
    FetchIntervalMinutes,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Feeds::Table)
                    .add_column(
                        ColumnDef::new(Feeds::FetchIntervalMinutes)
                            .integer()
                            .not_null()
                            .default(1440),
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
                    .drop_column(Feeds::FetchIntervalMinutes)
                    .to_owned(),
            )
            .await
    }
}
