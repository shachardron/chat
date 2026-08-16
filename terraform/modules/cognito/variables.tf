variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "callback_urls" {
  type    = list(string)
  default = []
}

variable "logout_urls" {
  type    = list(string)
  default = []
}

variable "alb_dns_name" {
  description = "ALB DNS name injected so Cognito callback URLs stay in sync"
  type        = string
  default     = ""
}
