use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{sea_query::Expr, ConnectionTrait, DbErr, Set};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize, ToSchema)]
#[sea_orm(table_name = "user_feeds")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub user_id: i32,
    #[sea_orm(primary_key, auto_increment = false)]
    pub feed_id: i32,
    pub all_articles_read_at: Option<DateTime<Utc>>,
    pub unread_count: i32,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "crate::entities::feeds::Entity",
        from = "Column::FeedId",
        to = "crate::entities::feeds::Column::Id"
    )]
    Feed,
}

impl Related<crate::entities::feeds::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Feed.def()
    }
}

#[async_trait]
impl ActiveModelBehavior for ActiveModel {
    async fn before_save<C>(mut self, _db: &C, insert: bool) -> Result<Self, DbErr>
    where
        C: ConnectionTrait,
    {
        let now = Utc::now();
        if insert {
            self.created_at = Set(now);
        }
        self.updated_at = Set(now);
        Ok(self)
    }
}

impl Model {
    /// All feed subscriptions for a user, ordered by sort_order.
    pub async fn for_user(db: &impl ConnectionTrait, user_id: i32) -> Result<Vec<Self>, DbErr> {
        use sea_orm::{EntityTrait, QueryFilter, QueryOrder};
        Entity::find()
            .filter(Column::UserId.eq(user_id))
            .order_by_asc(Column::SortOrder)
            .all(db)
            .await
    }

    /// Look up a single subscription by (user_id, feed_id).
    pub async fn find_subscription(
        db: &impl ConnectionTrait,
        user_id: i32,
        feed_id: i32,
    ) -> Result<Option<Self>, DbErr> {
        use sea_orm::EntityTrait;
        Entity::find_by_id((user_id, feed_id)).one(db).await
    }

    /// Create a new feed subscription for a user.
    pub async fn create(
        db: &impl ConnectionTrait,
        user_id: i32,
        feed_id: i32,
    ) -> Result<Self, DbErr> {
        use sea_orm::{EntityTrait, QueryFilter};
        let existing_count = crate::entities::articles::Model::unread_count(db, feed_id, None)
            .await
            .unwrap_or(0) as i32;
        let sort_order = Entity::find()
            .filter(Column::UserId.eq(user_id))
            .count(db)
            .await
            .unwrap_or(0) as i32;
        ActiveModel {
            user_id: Set(user_id),
            feed_id: Set(feed_id),
            all_articles_read_at: Set(None),
            unread_count: Set(existing_count),
            sort_order: Set(sort_order),
            ..Default::default()
        }
        .insert(db)
        .await
    }

    /// Set `all_articles_read_at` to now. Returns `None` if the subscription doesn't exist.
    pub async fn mark_read(
        db: &impl ConnectionTrait,
        user_id: i32,
        feed_id: i32,
    ) -> Result<Option<Self>, DbErr> {
        use sea_orm::{ActiveModelTrait, EntityTrait};
        let Some(row) = Entity::find_by_id((user_id, feed_id)).one(db).await? else {
            return Ok(None);
        };
        let mut active: ActiveModel = row.into();
        active.all_articles_read_at = Set(Some(Utc::now()));
        active.unread_count = Set(0);
        active.updated_at = Set(Utc::now());
        active.update(db).await.map(Some)
    }

    /// Increment `unread_count` by 1 for every subscriber of the given feed.
    /// Called by the worker after inserting a new article.
    pub async fn increment_unread_for_feed(
        db: &impl ConnectionTrait,
        feed_id: i32,
    ) -> Result<(), DbErr> {
        use sea_orm::{EntityTrait, QueryFilter};
        Entity::update_many()
            .col_expr(Column::UnreadCount, Expr::cust("unread_count + 1"))
            .col_expr(Column::UpdatedAt, Expr::cust("CURRENT_TIMESTAMP"))
            .filter(Column::FeedId.eq(feed_id))
            .exec(db)
            .await?;
        Ok(())
    }

    /// Remove a user's subscription to a feed.
    pub async fn delete(
        db: &impl ConnectionTrait,
        user_id: i32,
        feed_id: i32,
    ) -> Result<(), DbErr> {
        use sea_orm::{EntityTrait, QueryFilter};
        Entity::delete_many()
            .filter(Column::UserId.eq(user_id))
            .filter(Column::FeedId.eq(feed_id))
            .exec(db)
            .await?;
        Ok(())
    }

    /// Decrement `unread_count` by 1 (floor 0) for a specific user/feed subscription.
    /// Called after an individual article is marked read.
    pub async fn decrement_unread(
        db: &impl ConnectionTrait,
        user_id: i32,
        feed_id: i32,
    ) -> Result<(), DbErr> {
        use sea_orm::{EntityTrait, QueryFilter};
        Entity::update_many()
            .col_expr(
                Column::UnreadCount,
                Expr::cust("GREATEST(unread_count - 1, 0)"),
            )
            .col_expr(Column::UpdatedAt, Expr::cust("CURRENT_TIMESTAMP"))
            .filter(Column::UserId.eq(user_id))
            .filter(Column::FeedId.eq(feed_id))
            .exec(db)
            .await?;
        Ok(())
    }

    /// Recalculate `unread_count` for every user_feed row from ground truth.
    ///
    /// An article is considered unread for a user if:
    /// - It is not covered by `all_articles_read_at` (i.e. created after that timestamp, or
    ///   no bulk mark-all-read has been performed), AND
    /// - The user has not individually marked it as read (`user_articles.viewed_at IS NULL`
    ///   or no `user_articles` row exists).
    ///
    /// Returns the number of rows updated.
    pub async fn fix_unread_drift_for_all(db: &impl ConnectionTrait) -> Result<u64, DbErr> {
        let result = db
            .execute_unprepared(
                r#"
                UPDATE user_feeds uf
                SET
                    unread_count = (
                        SELECT COUNT(*)::integer
                        FROM articles a
                        WHERE a.feed_id = uf.feed_id
                          AND (
                              uf.all_articles_read_at IS NULL
                              OR a.created_at > uf.all_articles_read_at
                          )
                          AND NOT EXISTS (
                              SELECT 1 FROM user_articles ua
                              WHERE ua.article_id = a.id
                                AND ua.user_id = uf.user_id
                                AND ua.viewed_at IS NOT NULL
                          )
                    ),
                    updated_at = CURRENT_TIMESTAMP
                "#,
            )
            .await?;
        Ok(result.rows_affected())
    }
}
