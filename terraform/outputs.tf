# ─────────────────────────────────────────────
# Top-level outputs — all values you need after apply
# ─────────────────────────────────────────────

output "alb_dns_name" {
  description = "Public DNS of the Application Load Balancer (frontend entry point)"
  value       = module.ecs.alb_dns_name
}

output "frontend_url" {
  description = "HTTPS URL of the chat frontend"
  value       = "https://${module.ecs.alb_dns_name}"
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "cognito_client_id" {
  description = "Cognito App Client ID (used by the frontend)"
  value       = module.cognito.client_id
}

output "cognito_domain" {
  description = "Cognito hosted-UI domain prefix"
  value       = module.cognito.domain
}

output "cognito_issuer_url" {
  description = "OIDC issuer URL (used for JWT validation in AgentCore)"
  value       = module.cognito.issuer_url
}

output "harness_arn" {
  description = "AgentCore Harness ARN"
  value       = module.agentcore.harness_arn
  sensitive   = true
}

output "gateway_arn" {
  description = "AgentCore Web Search Gateway ARN (us-east-1)"
  value       = module.web_search_gateway.gateway_arn
  sensitive   = true
}

output "gateway_endpoint" {
  description = "AgentCore Web Search Gateway MCP endpoint URL (us-east-1)"
  value       = module.web_search_gateway.gateway_endpoint
  sensitive   = true
}

output "ecr_repository_url" {
  description = "ECR repository URL — push the frontend image here"
  value       = module.ecs.ecr_repository_url
}

output "waf_web_acl_arn" {
  description = "ARN of the WAF Web ACL protecting the ALB"
  value       = module.waf.web_acl_arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = module.ecs.service_name
}

output "vpc_id" {
  description = "VPC ID in use"
  value       = var.vpc_id
}

output "harness_execution_role_arn" {
  description = "IAM role ARN assumed by the AgentCore Harness"
  value       = module.iam.harness_execution_role_arn
}
