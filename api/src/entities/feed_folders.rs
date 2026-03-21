use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{ConnectionTrait, DbErr, Set};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize, ToSchema)]
#[sea_orm(table_name = "feed_folders")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub user_id: i32,
    pub name: String,
    pub sort_order: i32,
    pub view_mode: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

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
    pub async fn for_user(db: &impl ConnectionTrait, user_id: i32) -> Result<Vec<Self>, DbErr> {
        use sea_orm::{EntityTrait, QueryFilter, QueryOrder};
        Entity::find()
            .filter(Column::UserId.eq(user_id))
            .order_by_asc(Column::SortOrder)
            .all(db)
            .await
    }

    pub async fn find_by_id_and_user(
        db: &impl ConnectionTrait,
        id: i32,
        user_id: i32,
    ) -> Result<Option<Self>, DbErr> {
        use sea_orm::{EntityTrait, QueryFilter};
        Entity::find_by_id(id)
            .filter(Column::UserId.eq(user_id))
            .one(db)
            .await
    }

    pub async fn create(
        db: &impl ConnectionTrait,
        user_id: i32,
        name: String,
    ) -> Result<Self, DbErr> {
        let sort_order = Entity::find()
            .filter(Column::UserId.eq(user_id))
            .count(db)
            .await
            .unwrap_or(0) as i32;
        ActiveModel {
            user_id: Set(user_id),
            name: Set(name),
            sort_order: Set(sort_order),
            ..Default::default()
        }
        .insert(db)
        .await
    }

    pub async fn rename(
        db: &impl ConnectionTrait,
        id: i32,
        user_id: i32,
        name: String,
    ) -> Result<Option<Self>, DbErr> {
        let model = Self::find_by_id_and_user(db, id, user_id).await?;
        match model {
            None => Ok(None),
            Some(m) => {
                let mut active: ActiveModel = m.into();
                active.name = Set(name);
                Ok(Some(active.update(db).await?))
            }
        }
    }

    pub async fn delete(db: &impl ConnectionTrait, id: i32, user_id: i32) -> Result<bool, DbErr> {
        use sea_orm::QueryFilter;
        let result = Entity::delete_many()
            .filter(Column::Id.eq(id))
            .filter(Column::UserId.eq(user_id))
            .exec(db)
            .await?;
        Ok(result.rows_affected > 0)
    }

    pub async fn set_view_mode(
        db: &impl ConnectionTrait,
        id: i32,
        user_id: i32,
        view_mode: &str,
    ) -> Result<Option<Self>, DbErr> {
        let model = Self::find_by_id_and_user(db, id, user_id).await?;
        match model {
            None => Ok(None),
            Some(m) => {
                let mut active: ActiveModel = m.into();
                active.view_mode = Set(view_mode.to_string());
                Ok(Some(active.update(db).await?))
            }
        }
    }
}
