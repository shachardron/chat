variable "project_name" { type = string }
variable "environment"  { type = string }

variable "alb_arn" {
  description = "ARN of the ALB to attach the Web ACL to"
  type        = string
}

variable "allowed_ip_cidrs" {
  description = "List of IPv4 CIDRs allowed through the WAF. All other traffic is blocked."
  type        = list(string)

  validation {
    condition = alltrue([
      for cidr in var.allowed_ip_cidrs :
      can(regex("^(\\d{1,3}\\.){3}\\d{1,3}/\\d{1,2}$", cidr))
    ])
    error_message = "Each entry must be a valid IPv4 CIDR, e.g. 203.0.113.0/24 or 198.51.100.42/32."
  }
}

variable "allowed_ipv6_cidrs" {
  description = "Optional list of IPv6 CIDRs allowed through the WAF"
  type        = list(string)
  default     = []
}

variable "waf_allow_all" {
  description = "When true, WAF default action is ALLOW (open to all traffic). Use for pentesting."
  type        = bool
  default     = false
}
