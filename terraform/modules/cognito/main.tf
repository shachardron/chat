resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# ── User Pool ────────────────────────────────

resource "aws_cognito_user_pool" "this" {
  name = "${var.project_name}-${var.environment}-users"

  # Username / sign-in options
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  # MFA — optional (users can set up TOTP)
  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Email verification
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your ${var.project_name} verification code"
    email_message        = "Your verification code is {####}"
  }

  # User attributes
  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    string_attribute_constraints {
      min_length = 5
      max_length = 256
    }
  }

  # Advanced security — audit mode (set to ENFORCED for production)
  user_pool_add_ons {
    advanced_security_mode = "AUDIT"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-user-pool"
  }
}

# ── Cognito Domain (hosted UI) ───────────────

resource "aws_cognito_user_pool_domain" "this" {
  domain       = "${var.project_name}-${var.environment}-${random_string.suffix.result}"
  user_pool_id = aws_cognito_user_pool.this.id
}

# ── App Client ───────────────────────────────

locals {
  # Merge provided callback URLs with the ALB-derived one
  callback_urls = distinct(concat(
    var.callback_urls,
    var.alb_dns_name != "" ? ["https://${var.alb_dns_name}/callback"] : []
  ))
  logout_urls = distinct(concat(
    var.logout_urls,
    var.alb_dns_name != "" ? ["https://${var.alb_dns_name}/logout"] : []
  ))
}

resource "aws_cognito_user_pool_client" "this" {
  name         = "${var.project_name}-${var.environment}-client"
  user_pool_id = aws_cognito_user_pool.this.id

  # OAuth 2.0 / OIDC settings
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  # Use the merged URL lists; fall back to a placeholder so the resource is valid
  callback_urls = length(local.callback_urls) > 0 ? local.callback_urls : ["https://localhost:3000/callback"]
  logout_urls   = length(local.logout_urls) > 0 ? local.logout_urls : ["https://localhost:3000/logout"]

  supported_identity_providers = ["COGNITO"]

  # Token expiry
  access_token_validity  = 1   # 1 hour
  id_token_validity      = 1   # 1 hour
  refresh_token_validity = 30  # 30 days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Security settings
  enable_token_revocation               = true
  prevent_user_existence_errors         = "ENABLED"
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH"
  ]

  # No client secret — this is a public SPA client
  generate_secret = false
}

# ── Resource Server (for machine-to-machine scopes if needed) ─

resource "aws_cognito_resource_server" "harness" {
  identifier   = "https://bedrock-agentcore.amazonaws.com"
  name         = "AgentCore Harness"
  user_pool_id = aws_cognito_user_pool.this.id

  scope {
    scope_name        = "invoke"
    scope_description = "Invoke the AgentCore Harness"
  }
}
