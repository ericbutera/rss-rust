use auth::openapi as auth_openapi;
use glass::openapi as glass_openapi;
use glass::SecurityAddon;
use utoipa::OpenApi;

#[derive(OpenApi)]
#[openapi(
    paths(
        auth_openapi::paths::register,
        auth_openapi::paths::login,
        auth_openapi::paths::current,
        auth_openapi::paths::refresh,
        auth_openapi::paths::logout,
        auth_openapi::paths::verify_email,
        auth_openapi::paths::resend_confirmation,
        auth_openapi::paths::forgot_password,
        auth_openapi::paths::reset_password,
        auth_openapi::paths::oauth_authorize,
        auth_openapi::paths::oauth_callback,
        glass_openapi::paths::public_flags,
        glass_openapi::paths::list_flags,
        glass_openapi::paths::update_flag,
        crate::controllers::feeds::list_feeds,
        crate::controllers::feeds::create_feed,
        crate::controllers::feeds::list_articles,
        crate::controllers::feeds::mark_feed_read,
        crate::controllers::feeds::mark_article_read,
        crate::controllers::admin::fix_unread_drift,
    ),
    components(
        schemas(
            auth_openapi::schemas::MessageResponse,
            auth_openapi::schemas::RegisterRequest,
            auth_openapi::schemas::RegisterResponse,
            auth_openapi::schemas::LoginRequest,
            auth_openapi::schemas::UserResponse,
            auth_openapi::schemas::ResendConfirmationRequest,
            auth_openapi::schemas::ForgotPasswordRequest,
            auth_openapi::schemas::ResetPasswordRequest,
            glass_openapi::schemas::PublicFlagResponse,
            glass_openapi::schemas::FeatureFlagResponse,
            glass_openapi::schemas::UpdateFlagRequest,
            glass_openapi::schemas::PaginatedResponse<glass_openapi::schemas::FeatureFlagResponse>,
            glass_openapi::schemas::PaginatedResponse<glass_openapi::schemas::PublicFlagResponse>,
            glass::data::pagination::PaginationParams,
            crate::controllers::feeds::CreateFeedRequest,
            crate::controllers::feeds::FeedResponse,
            crate::controllers::feeds::ArticleResponse,
            crate::controllers::feeds::ArticlesPage,
            crate::controllers::feeds::MessageResponse,
            crate::controllers::admin::FixDriftResponse,
        )
    ),
    tags(
        (name = "admin", description = "Admin-only endpoints"),
        (name = "auth", description = "Authentication and user management"),
        (name = "feeds", description = "RSS feed management"),
        (name = "flags", description = "Feature flags"),
        (name = "oauth", description = "OAuth authentication")
    ),
    modifiers(&SecurityAddon)
)]
pub struct ApiDoc;
