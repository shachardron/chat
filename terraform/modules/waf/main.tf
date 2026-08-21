# ─────────────────────────────────────────────
# AWS WAF v2 — IP allowlist for the ALB
#
# Default action: BLOCK all traffic.
# Exception: requests from IPs in var.allowed_ip_cidrs are ALLOWED.
# Scope is REGIONAL (attaches to ALB, not CloudFront).
# ─────────────────────────────────────────────

# ── IPv4 IP Set ───────────────────────────────

resource "aws_wafv2_ip_set" "allowed" {
  name               = "${var.project_name}-${var.environment}-allowed-ips"
  description        = "IPv4 addresses allowed to access the chat frontend"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.allowed_ip_cidrs

  tags = { Name = "${var.project_name}-${var.environment}-allowed-ips" }
}

# ── IPv6 IP Set (optional) ────────────────────

resource "aws_wafv2_ip_set" "allowed_ipv6" {
  count = length(var.allowed_ipv6_cidrs) > 0 ? 1 : 0

  name               = "${var.project_name}-${var.environment}-allowed-ips-v6"
  description        = "IPv6 addresses allowed to access the chat frontend"
  scope              = "REGIONAL"
  ip_address_version = "IPV6"
  addresses          = var.allowed_ipv6_cidrs

  tags = { Name = "${var.project_name}-${var.environment}-allowed-ips-v6" }
}

# ── Web ACL ───────────────────────────────────

resource "aws_wafv2_web_acl" "this" {
  name        = "${var.project_name}-${var.environment}-acl"
  description = "Allow only traffic from approved IPs. Block everything else."
  scope       = "REGIONAL"

  # Default: block all requests that don't match an allow rule
  default_action {
    dynamic "block" {
      for_each = var.waf_allow_all ? [] : [1]
      content {
        custom_response {
          response_code = 403
          response_header {
            name  = "x-blocked-by"
            value = "bedrock-chat-waf"
          }
        }
      }
    }

    dynamic "allow" {
      for_each = var.waf_allow_all ? [1] : []
      content {}
    }
  }

  # ── Rule 1: Allow IPv4 allowlist ──────────────────────────
  rule {
    name     = "AllowIPv4"
    priority = 10

    action {
      allow {}
    }

    statement {
      ip_set_reference_statement {
        arn = aws_wafv2_ip_set.allowed.arn
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-allow-ipv4"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 2: Allow IPv6 allowlist (conditional) ────────────
  dynamic "rule" {
    for_each = length(var.allowed_ipv6_cidrs) > 0 ? [1] : []
    content {
      name     = "AllowIPv6"
      priority = 20

      action {
        allow {}
      }

      statement {
        ip_set_reference_statement {
          arn = aws_wafv2_ip_set.allowed_ipv6[0].arn
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.project_name}-${var.environment}-allow-ipv6"
        sampled_requests_enabled   = true
      }
    }
  }

  # ── Rule 3: AWS Managed Common Rules (count mode) ─────────
  # Counts SQLi / XSS / bad inputs from allowlisted IPs for visibility.
  # Change override_action to none {} to switch to blocking mode.
  rule {
    name     = "AWSManagedCommonRules"
    priority = 30

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-aws-common"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-${var.environment}-acl"
    sampled_requests_enabled   = true
  }

  tags = { Name = "${var.project_name}-${var.environment}-acl" }
}

# ── Associate WAF ACL with the ALB ────────────

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = var.alb_arn
  web_acl_arn  = aws_wafv2_web_acl.this.arn
}

# ── WAF logging to CloudWatch ─────────────────
# Log group name MUST start with "aws-waf-logs-"

resource "aws_cloudwatch_log_group" "waf" {
  name              = "aws-waf-logs-${var.project_name}-${var.environment}"
  retention_in_days = 30
}

resource "aws_wafv2_web_acl_logging_configuration" "this" {
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn            = aws_wafv2_web_acl.this.arn

  # Redact Authorization header — contains Cognito JWT tokens
  redacted_fields {
    single_header {
      name = "authorization"
    }
  }
}
