use crate::config::Config;
use crate::tasks::TaskQueue;
use crate::tasks::{create_auth_service, AppAuthService};
use auth::controllers::oauth::OAuthRouteStorage;
use auth::{AuthRouteStorage, AuthStorage};
use background_jobs::admin::BackgroundTasksStorage;
use glass::feature_flags::{FeatureFlagService, FeatureFlagStorage};
use migration::MigratorTrait;
use sea_orm::DatabaseConnection;

#[derive(Clone)]
pub struct AppStorage {
    pub db: DatabaseConnection,
    pub tasks: TaskQueue,
    pub feature_flags: FeatureFlagService,
    pub auth_service: AppAuthService,
}

impl AppStorage {
    pub async fn new(database_url: &str) -> Self {
        let db = sea_orm::Database::connect(database_url)
            .await
            .expect("DB connection failed");

        migration::Migrator::up(&db, None)
            .await
            .expect("Migration failed");

        let tasks = TaskQueue::new(db.clone());

        let feature_flags = FeatureFlagService::new();
        if let Err(err) = feature_flags.load_cache(&db).await {
            tracing::warn!(error = ?err, "failed to load feature flags cache");
        }

        let auth_service = create_auth_service(db.clone(), tasks.clone());

        Self {
            db,
            tasks,
            feature_flags,
            auth_service,
        }
    }
}

impl FeatureFlagStorage for AppStorage {
    fn db(&self) -> &DatabaseConnection {
        &self.db
    }

    fn feature_flag_service(&self) -> &FeatureFlagService {
        &self.feature_flags
    }
}

impl BackgroundTasksStorage for AppStorage {
    fn db(&self) -> &DatabaseConnection {
        &self.db
    }
}

impl AuthStorage for AppStorage {
    fn db(&self) -> &DatabaseConnection {
        &self.db
    }

    fn jwt_secret(&self) -> &str {
        &Config::get().jwt_secret
    }
}

impl AuthRouteStorage for AppStorage {
    type EmailService = auth::AuthEmailService;
    type CooldownManager = auth::DefaultCooldownManager;
    type AuditLogger = auth::SeaOrmAuditLogger;
    type MetricsRecorder = auth::FnMetricsRecorder;
    type ConfigProvider = auth::EnvConfigProvider;

    fn db(&self) -> &DatabaseConnection {
        &self.db
    }

    fn auth_service(&self) -> &AppAuthService {
        &self.auth_service
    }

    fn frontend_url(&self) -> &str {
        &Config::get().frontend_url
    }
}

impl OAuthRouteStorage for AppStorage {
    fn api_url(&self) -> &str {
        &Config::get().api_url
    }

    fn oauth_enabled(&self) -> bool {
        false
    }
}
