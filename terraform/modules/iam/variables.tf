variable "project_name" { type = string }
variable "environment"  { type = string }
variable "aws_region"   { type = string }
variable "aws_account"  { type = string }

variable "agentcore_gateway_arn" {
  description = "ARN of the AgentCore Gateway — used to scope the harness gateway-invoke policy. Pass empty string before gateway exists."
  type        = string
  default     = ""
}
