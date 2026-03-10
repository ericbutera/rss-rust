#![allow(elided_lifetimes_in_paths)]
#![allow(clippy::wildcard_imports)]
pub use sea_orm_migration::prelude::*;
mod m20260307_120000_init;
mod m20260309_000000_add_unread_count_to_user_feeds;
mod m20260309_100000_add_fetch_history_fields;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        // Load Kaleido (external) migrations first and sort them by migration name
        let mut v = kaleido_migrations::external_migrations();
        v.sort_by_key(|m| m.name().to_string());

        // Collect local migrations, sort them, then append so Kaleido runs first
        let mut locals: Vec<Box<dyn MigrationTrait>> = Vec::new();
        locals.push(Box::new(m20260307_120000_init::Migration));
        locals.push(Box::new(
            m20260309_000000_add_unread_count_to_user_feeds::Migration,
        ));
        locals.push(Box::new(
            m20260309_100000_add_fetch_history_fields::Migration,
        ));

        locals.sort_by_key(|m| m.name().to_string());

        v.extend(locals);

        v
    }
}
