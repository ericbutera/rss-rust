use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{ConnectionTrait, DbErr, Set};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize, ToSchema)]
#[sea_orm(table_name = "feeds")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub url: String,
    pub url_hash: String,
    pub name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub verified_at: Option<DateTime<Utc>>,
    pub deactivated_at: Option<DateTime<Utc>>,
    pub created_by: Option<i32>,
    pub fetch_interval_minutes: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "crate::entities::articles::Entity")]
    Article,
    #[sea_orm(has_many = "crate::entities::user_feeds::Entity")]
    UserFeed,
}

impl Related<crate::entities::articles::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Article.def()
    }
}

impl Related<crate::entities::user_feeds::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::UserFeed.def()
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
    /// Returns all feeds that have not been deactivated.
    pub async fn find_active(db: &impl ConnectionTrait) -> Result<Vec<Self>, DbErr> {
        use sea_orm::{EntityTrait, QueryFilter};
        Entity::find()
            .filter(Column::DeactivatedAt.is_null())
            .all(db)
            .await
    }

    /// Look up a single feed by primary key.
    pub async fn find_by_id(db: &impl ConnectionTrait, id: i32) -> Result<Option<Self>, DbErr> {
        use sea_orm::EntityTrait;
        Entity::find_by_id(id).one(db).await
    }

    /// Look up a feed by its URL hash.
    pub async fn find_by_url_hash(
        db: &impl ConnectionTrait,
        hash: &str,
    ) -> Result<Option<Self>, DbErr> {
        use sea_orm::{EntityTrait, QueryFilter};
        Entity::find()
            .filter(Column::UrlHash.eq(hash))
            .one(db)
            .await
    }

    /// All active feeds whose IDs are in the supplied list.
    pub async fn find_active_by_ids(
        db: &impl ConnectionTrait,
        ids: Vec<i32>,
    ) -> Result<Vec<Self>, DbErr> {
        use sea_orm::{EntityTrait, QueryFilter};
        Entity::find()
            .filter(Column::Id.is_in(ids))
            .filter(Column::DeactivatedAt.is_null())
            .all(db)
            .await
    }

    /// Insert a new feed row.
    pub async fn create(
        db: &impl ConnectionTrait,
        url: String,
        url_hash: String,
        name: Option<String>,
        created_by: i32,
    ) -> Result<Self, DbErr> {
        // TODO: normalize url to prevent duplicates (url query param order, fragments, etc)
        ActiveModel {
            url: Set(url),
            url_hash: Set(url_hash),
            name: Set(name),
            verified_at: Set(None),
            deactivated_at: Set(None),
            created_by: Set(Some(created_by)),
            fetch_interval_minutes: Set(1440),
            ..Default::default()
        }
        .insert(db)
        .await
    }

    /// Returns true if this feed has been deactivated.
    pub fn is_deactivated(&self) -> bool {
        self.deactivated_at.is_some()
    }

    /// Set `verified_at` to the current time for this feed.
    pub async fn mark_verified(db: &impl ConnectionTrait, id: i32) -> Result<(), DbErr> {
        use sea_orm::{EntityTrait, IntoActiveModel};
        let feed = Entity::find_by_id(id)
            .one(db)
            .await?
            .ok_or_else(|| DbErr::RecordNotFound(format!("Feed {id} not found")))?;
        let mut active = feed.into_active_model();
        active.verified_at = Set(Some(Utc::now()));
        active.update(db).await?;
        Ok(())
    }
}
