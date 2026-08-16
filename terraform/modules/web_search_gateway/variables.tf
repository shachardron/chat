variable "project_name" { type = string }
variable "environment"  { type = string }
variable "aws_account"  { type = string }

variable "cognito_issuer_url" {
  description = "Cognito OIDC issuer URL for the Gateway JWT authorizer"
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito App Client ID allowed to call the Gateway"
  type        = string
}
