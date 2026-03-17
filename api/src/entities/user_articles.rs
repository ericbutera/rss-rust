use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{ConnectionTrait, DbErr, Set};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize, ToSchema)]
#[sea_orm(table_name = "user_articles")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub user_id: i32,
    #[sea_orm(primary_key, auto_increment = false)]
    pub article_id: i32,
    pub viewed_at: Option<DateTime<Utc>>,
    pub saved_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "crate::entities::articles::Entity",
        from = "Column::ArticleId",
        to = "crate::entities::articles::Column::Id"
    )]
    Article,
}

impl Related<crate::entities::articles::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Article.def()
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
    /// Returns a map of `article_id → (viewed_at, saved_at)` for the given user and article IDs.
    pub async fn state_map_for_user(
        db: &impl ConnectionTrait,
        user_id: i32,
        article_ids: Vec<i32>,
    ) -> Result<std::collections::HashMap<i32, (Option<DateTime<Utc>>, Option<DateTime<Utc>>)>, DbErr>
    {
        use sea_orm::{EntityTrait, QueryFilter};
        let rows = Entity::find()
            .filter(Column::UserId.eq(user_id))
            .filter(Column::ArticleId.is_in(article_ids))
            .all(db)
            .await?;
        Ok(rows
            .into_iter()
            .map(|ua| (ua.article_id, (ua.viewed_at, ua.saved_at)))
            .collect())
    }

    /// Returns a map of `article_id → viewed_at` for the given user and article IDs.
    pub async fn read_map_for_user(
        db: &impl ConnectionTrait,
        user_id: i32,
        article_ids: Vec<i32>,
    ) -> Result<std::collections::HashMap<i32, Option<DateTime<Utc>>>, DbErr> {
        let state_map = Self::state_map_for_user(db, user_id, article_ids).await?;
        Ok(state_map
            .into_iter()
            .map(|(id, (viewed, _))| (id, viewed))
            .collect())
    }

    /// Upsert a read record for the given user and article.
    /// Returns `true` if the article was newly marked read, `false` if it was already read.
    pub async fn mark_read(
        db: &impl ConnectionTrait,
        user_id: i32,
        article_id: i32,
    ) -> Result<bool, DbErr> {
        use sea_orm::{ActiveModelTrait, EntityTrait};
        let now = Utc::now();
        match Entity::find_by_id((user_id, article_id)).one(db).await? {
            Some(existing) => {
                let was_unread = existing.viewed_at.is_none();
                let mut active: ActiveModel = existing.into();
                active.viewed_at = Set(Some(now));
                active.updated_at = Set(now);
                active.update(db).await?;
                Ok(was_unread)
            }
            None => {
                ActiveModel {
                    user_id: Set(user_id),
                    article_id: Set(article_id),
                    viewed_at: Set(Some(now)),
                    ..Default::default()
                }
                .insert(db)
                .await?;
                Ok(true)
            }
        }
    }

    /// Toggle saved state for an article. Returns the new saved_at value.
    pub async fn toggle_save(
        db: &impl ConnectionTrait,
        user_id: i32,
        article_id: i32,
    ) -> Result<Option<DateTime<Utc>>, DbErr> {
        use sea_orm::{ActiveModelTrait, EntityTrait};
        let now = Utc::now();
        match Entity::find_by_id((user_id, article_id)).one(db).await? {
            Some(existing) => {
                let new_saved = if existing.saved_at.is_some() {
                    None
                } else {
                    Some(now)
                };
                let mut active: ActiveModel = existing.into();
                active.saved_at = Set(new_saved);
                active.updated_at = Set(now);
                active.update(db).await?;
                Ok(new_saved)
            }
            None => {
                ActiveModel {
                    user_id: Set(user_id),
                    article_id: Set(article_id),
                    saved_at: Set(Some(now)),
                    ..Default::default()
                }
                .insert(db)
                .await?;
                Ok(Some(now))
            }
        }
    }
}
