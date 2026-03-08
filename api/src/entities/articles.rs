use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{ConnectionTrait, DbErr, Set};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize, ToSchema)]
#[sea_orm(table_name = "articles")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub feed_id: i32,
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub preview: Option<String>,
    pub content: Option<String>,
    pub guid: Option<String>,
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
    #[sea_orm(has_many = "crate::entities::user_articles::Entity")]
    UserArticle,
}

impl Related<crate::entities::feeds::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Feed.def()
    }
}

impl Related<crate::entities::user_articles::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::UserArticle.def()
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
    /// Returns true if an article with the given URL already exists.
    pub async fn exists_by_url(db: &impl ConnectionTrait, url: &str) -> Result<bool, DbErr> {
        use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
        Ok(Entity::find()
            .filter(Column::Url.eq(url))
            .one(db)
            .await?
            .is_some())
    }

    /// Look up a single article by primary key.
    pub async fn find_by_id(db: &impl ConnectionTrait, id: i32) -> Result<Option<Self>, DbErr> {
        use sea_orm::EntityTrait;
        Entity::find_by_id(id).one(db).await
    }

    /// Paginated list of articles for a feed, ordered newest-first.
    /// Returns `(items, total_count)`.
    pub async fn list_for_feed(
        db: &impl ConnectionTrait,
        feed_id: i32,
        page: u64,
        per_page: u64,
    ) -> Result<(Vec<Self>, u64), DbErr> {
        use sea_orm::{EntityTrait, PaginatorTrait, QueryFilter, QueryOrder};
        let paginator = Entity::find()
            .filter(Column::FeedId.eq(feed_id))
            .order_by_desc(Column::CreatedAt)
            .paginate(db, per_page);
        let total = paginator.num_items().await?;
        let items = paginator.fetch_page(page - 1).await?;
        Ok((items, total))
    }

    /// Inserts a new article row.
    pub async fn create(
        db: &impl ConnectionTrait,
        feed_id: i32,
        url: String,
        title: Option<String>,
        description: Option<String>,
        content: Option<String>,
        guid: Option<String>,
    ) -> Result<Self, DbErr> {
        ActiveModel {
            feed_id: Set(feed_id),
            url: Set(url),
            title: Set(title),
            description: Set(description),
            image_url: Set(None),
            preview: Set(None),
            content: Set(content),
            guid: Set(guid),
            ..Default::default()
        }
        .insert(db)
        .await
    }
}
