use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{ConnectionTrait, DbErr, Set};
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
    /// All feed subscriptions for a user.
    pub async fn for_user(db: &impl ConnectionTrait, user_id: i32) -> Result<Vec<Self>, DbErr> {
        use sea_orm::{EntityTrait, QueryFilter};
        Entity::find()
            .filter(Column::UserId.eq(user_id))
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
        ActiveModel {
            user_id: Set(user_id),
            feed_id: Set(feed_id),
            all_articles_read_at: Set(None),
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
        active.updated_at = Set(Utc::now());
        active.update(db).await.map(Some)
    }
}
