variable "project_name"               { type = string }
variable "environment"                { type = string }
variable "aws_region"                 { type = string }
variable "aws_account"                { type = string }
variable "harness_execution_role_arn" { type = string }
variable "cognito_issuer_url"         { type = string }
variable "cognito_client_id"          { type = string }
variable "model_id"                   { type = string }

variable "web_search_gateway_endpoint" {
  description = "MCP endpoint URL of the AgentCore Web Search Gateway (us-east-1)"
  type        = string
}
