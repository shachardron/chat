variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Short name used as a prefix for all resources"
  type        = string
  default     = "bedrock-chat"
}

variable "environment" {
  description = "Deployment environment (dev / staging / prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

# ── Network — existing VPC ────────────────────

variable "vpc_id" {
  description = "ID of the existing VPC to deploy into (e.g. vpc-0abc12345)"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of existing public subnet IDs for the ALB (minimum 2, in different AZs)"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "List of existing private subnet IDs for ECS tasks (minimum 2, in different AZs)"
  type        = list(string)
}

# ── Cognito ───────────────────────────────────

variable "cognito_callback_urls" {
  description = "Allowed OAuth callback URLs for the Cognito app client"
  type        = list(string)
  default     = []
  # Set to ["https://<alb-dns>/callback"] after first apply, or use your custom domain
}

variable "cognito_logout_urls" {
  description = "Allowed logout URLs for the Cognito app client"
  type        = list(string)
  default     = []
}

# ── Model ─────────────────────────────────────

variable "model_id" {
  description = "Bedrock inference profile ID for Claude Opus 4.7"
  type        = string
  # EU cross-region inference profile — confirmed ACTIVE in account 660653690423
  default     = "eu.anthropic.claude-opus-4-7"
}

# ── Web search ────────────────────────────────
# No variable needed — uses the native AgentCore Web Search connector
# in us-east-1. No API key or third-party credentials required.

# ── WAF — IP allowlist ────────────────────────

variable "waf_allowed_ip_cidrs" {
  description = "IPv4 CIDRs permitted to access the chat frontend. All other traffic is blocked by WAF. Use /32 for a single IP."
  type        = list(string)

  validation {
    condition     = length(var.waf_allowed_ip_cidrs) > 0
    error_message = "At least one IPv4 CIDR is required. Use 0.0.0.0/0 to allow all (not recommended)."
  }
}

variable "waf_allowed_ipv6_cidrs" {
  description = "IPv6 CIDRs permitted to access the chat frontend (optional)"
  type        = list(string)
  default     = []
}

variable "waf_allow_all" {
  description = "When true, WAF allows all traffic (for pentesting). Remember to set back to false after."
  type        = bool
  default     = false
}

# ── ECS / Frontend ────────────────────────────

variable "frontend_image_tag" {
  description = "Docker image tag to deploy for the frontend container. Use 'latest' during initial bootstrap; replace with a SHA after CI builds the image."
  type        = string
  default     = "latest"
}

variable "container_cpu" {
  description = "CPU units for the frontend Fargate task (1 vCPU = 1024)"
  type        = number
  default     = 512
}

variable "container_memory" {
  description = "Memory (MiB) for the frontend Fargate task"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS on the ALB. Leave empty to use HTTP (dev only)."
  type        = string
  default     = ""
}
