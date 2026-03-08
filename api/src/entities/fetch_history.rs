use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{ConnectionTrait, DbErr, Set};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize, ToSchema)]
#[sea_orm(table_name = "fetch_history")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub feed_id: i32,
    pub status_code: Option<i32>,
    pub etag: Option<String>,
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

use async_trait::async_trait;
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
    /// Returns the most recent etag recorded for the given feed, if any.
    pub async fn last_etag_for_feed(db: &impl ConnectionTrait, feed_id: i32) -> Option<String> {
        use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder};
        Entity::find()
            .filter(Column::FeedId.eq(feed_id))
            .filter(Column::Etag.is_not_null())
            .order_by_desc(Column::CreatedAt)
            .one(db)
            .await
            .ok()
            .flatten()
            .and_then(|r| r.etag)
    }

    /// Inserts a fetch history record for the given feed.
    pub async fn record(
        db: &impl ConnectionTrait,
        feed_id: i32,
        status_code: i32,
        etag: Option<&str>,
    ) -> Result<Self, DbErr> {
        ActiveModel {
            feed_id: Set(feed_id),
            status_code: Set(Some(status_code)),
            etag: Set(etag.map(str::to_string)),
            ..Default::default()
        }
        .insert(db)
        .await
    }
}
