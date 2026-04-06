use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(Iden)]
enum UserFeeds {
    Table,
    OnlyUnread,
}

#[derive(Iden)]
enum FeedFolders {
    Table,
    OnlyUnread,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(UserFeeds::Table)
                    .add_column(
                        ColumnDef::new(UserFeeds::OnlyUnread)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(FeedFolders::Table)
                    .add_column(
                        ColumnDef::new(FeedFolders::OnlyUnread)
                            .boolean()
                            .not_null()
                            .default(false),
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
                    .drop_column(UserFeeds::OnlyUnread)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(FeedFolders::Table)
                    .drop_column(FeedFolders::OnlyUnread)
                    .to_owned(),
            )
            .await
    }
}
