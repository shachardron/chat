output "web_acl_arn" {
  description = "ARN of the WAF Web ACL"
  value       = aws_wafv2_web_acl.this.arn
}

output "web_acl_id" {
  description = "ID of the WAF Web ACL"
  value       = aws_wafv2_web_acl.this.id
}

output "allowed_ip_set_arn" {
  description = "ARN of the IPv4 allowlist IP set"
  value       = aws_wafv2_ip_set.allowed.arn
}
