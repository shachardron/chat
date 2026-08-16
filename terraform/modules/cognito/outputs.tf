output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "client_id" {
  value = aws_cognito_user_pool_client.this.id
}

output "domain" {
  value = aws_cognito_user_pool_domain.this.domain
}

output "issuer_url" {
  description = "OIDC issuer URL — used by AgentCore JWT authorizer"
  value       = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}

output "hosted_ui_url" {
  description = "Cognito hosted UI base URL"
  value       = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
}

data "aws_region" "current" {}
