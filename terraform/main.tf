terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }

  # Uncomment and configure for remote state
  # backend "s3" {
  #   bucket         = "your-tfstate-bucket"
  #   key            = "bedrock-chat/terraform.tfstate"
  #   region         = "eu-central-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-locks"
  # }
}

# ── Primary provider — eu-central-1 (all main infra) ─────────
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ── Secondary provider — us-east-1 (AgentCore Web Search Gateway only) ──
# The native AgentCore Web Search connector is currently only available
# in us-east-1. The Gateway is created there; the eu-central-1 Harness
# connects to it via remote_mcp over HTTPS (SigV4-signed).
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ─────────────────────────────────────────────
# Existing VPC — data lookup (no resources created)
# ─────────────────────────────────────────────

data "aws_vpc" "existing" {
  id = var.vpc_id
}

# ─────────────────────────────────────────────
# Security Groups (in the existing eu-central-1 VPC)
# ─────────────────────────────────────────────

resource "aws_security_group" "alb" {
  name        = "${var.project_name}-${var.environment}-alb-sg"
  description = "Allow HTTP/HTTPS inbound to the Application Load Balancer"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP from internet (redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-alb-sg" }
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.project_name}-${var.environment}-ecs-sg"
  description = "Allow inbound on app port from ALB only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "From ALB on app port"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Allow all outbound (HTTPS to AWS APIs, Bedrock, etc.)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-ecs-sg" }
}

# ─────────────────────────────────────────────
# Modules
# ─────────────────────────────────────────────

module "cognito" {
  source = "./modules/cognito"

  project_name  = var.project_name
  environment   = var.environment
  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls
  # alb_dns_name is intentionally omitted here — it creates a cycle.
  # After the first apply, set cognito_callback_urls and cognito_logout_urls
  # in terraform.tfvars with the real ALB DNS and run terraform apply again.
  alb_dns_name  = ""
}

module "iam" {
  source = "./modules/iam"

  project_name  = var.project_name
  environment   = var.environment
  aws_region    = var.aws_region
  aws_account   = data.aws_caller_identity.current.account_id

  # Pass the us-east-1 Gateway ARN so the harness role can invoke it cross-region
  agentcore_gateway_arn = module.web_search_gateway.gateway_arn
}

# ── AgentCore Web Search Gateway (us-east-1) ─────────────────
# Native managed connector — no API key, no third-party credentials.
# Harness in eu-central-1 calls this via remote_mcp over HTTPS.

module "web_search_gateway" {
  source = "./modules/web_search_gateway"

  providers = {
    aws = aws.us_east_1
  }

  project_name       = var.project_name
  environment        = var.environment
  aws_account        = data.aws_caller_identity.current.account_id
  cognito_issuer_url = module.cognito.issuer_url
  cognito_client_id  = module.cognito.client_id
}

# ── AgentCore Harness (eu-central-1) ─────────────────────────

module "agentcore" {
  source = "./modules/agentcore"

  project_name               = var.project_name
  environment                = var.environment
  aws_region                 = var.aws_region
  aws_account                = data.aws_caller_identity.current.account_id
  harness_execution_role_arn = module.iam.harness_execution_role_arn
  cognito_issuer_url         = module.cognito.issuer_url
  cognito_client_id          = module.cognito.client_id
  model_id                   = var.model_id

  # MCP endpoint of the us-east-1 web search gateway
  web_search_gateway_endpoint = module.web_search_gateway.gateway_endpoint

  depends_on = [module.iam, module.web_search_gateway]
}

module "ecs" {
  source = "./modules/ecs"

  project_name          = var.project_name
  environment           = var.environment
  aws_region            = var.aws_region
  aws_account           = data.aws_caller_identity.current.account_id
  vpc_id                = var.vpc_id
  public_subnet_ids     = var.public_subnet_ids
  private_subnet_ids    = var.private_subnet_ids
  alb_security_group_id = aws_security_group.alb.id
  ecs_security_group_id = aws_security_group.ecs_tasks.id

  harness_arn              = module.agentcore.harness_arn
  gateway_endpoint         = module.web_search_gateway.gateway_endpoint
  cognito_user_pool_id     = module.cognito.user_pool_id
  cognito_client_id        = module.cognito.client_id
  cognito_domain           = module.cognito.domain
  cognito_region           = var.aws_region
  frontend_image_tag       = var.frontend_image_tag
  container_cpu            = var.container_cpu
  container_memory         = var.container_memory
  desired_count            = var.desired_count
  acm_certificate_arn      = var.acm_certificate_arn

  depends_on = [module.agentcore, module.cognito]
}

# ── WAF — IP allowlist on the ALB ────────────────────────────
# Default action: BLOCK. Only IPs in var.waf_allowed_ip_cidrs are allowed.
# Update the list in terraform.tfvars and re-apply to change access.

module "waf" {
  source = "./modules/waf"

  project_name       = var.project_name
  environment        = var.environment
  alb_arn            = module.ecs.alb_arn
  allowed_ip_cidrs   = var.waf_allowed_ip_cidrs
  allowed_ipv6_cidrs = var.waf_allowed_ipv6_cidrs
  waf_allow_all      = var.waf_allow_all

  depends_on = [module.ecs]
}

# ─────────────────────────────────────────────
# Data sources
# ─────────────────────────────────────────────

data "aws_caller_identity" "current" {}
