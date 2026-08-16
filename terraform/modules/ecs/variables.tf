variable "project_name"  { type = string }
variable "environment"   { type = string }
variable "aws_region"    { type = string }
variable "aws_account"   { type = string }
variable "vpc_id"        { type = string }

variable "public_subnet_ids" {
  type = list(string)
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "harness_arn" {
  description = "AgentCore Harness ARN — passed to the container as an env var"
  type        = string
}

variable "gateway_endpoint" {
  description = "AgentCore Gateway MCP endpoint URL"
  type        = string
}

variable "cognito_user_pool_id" { type = string }
variable "cognito_client_id"    { type = string }
variable "cognito_domain"       { type = string }
variable "cognito_region"       { type = string }

variable "frontend_image_tag" {
  type    = string
  default = "latest"
}

variable "container_cpu" {
  type    = number
  default = 512
}

variable "container_memory" {
  type    = number
  default = 1024
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS. Leave empty to use HTTP (dev only)."
  type        = string
  default     = ""
}

variable "alb_security_group_id" {
  description = "Security group ID to attach to the ALB"
  type        = string
}

variable "ecs_security_group_id" {
  description = "Security group ID to attach to ECS tasks"
  type        = string
}
