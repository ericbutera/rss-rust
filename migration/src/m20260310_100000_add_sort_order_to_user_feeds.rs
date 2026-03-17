use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(Iden)]
enum UserFeeds {
    Table,
    UserId,
    SortOrder,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(UserFeeds::Table)
                    .add_column(
                        ColumnDef::new(UserFeeds::SortOrder)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_user_feeds_user_id_sort_order")
                    .table(UserFeeds::Table)
                    .col(UserFeeds::UserId)
                    .col(UserFeeds::SortOrder)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("idx_user_feeds_user_id_sort_order")
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(UserFeeds::Table)
                    .drop_column(UserFeeds::SortOrder)
                    .to_owned(),
            )
            .await
    }
}
