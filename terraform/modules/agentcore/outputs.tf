output "harness_arn" {
  description = "ARN of the AgentCore Harness"
  value       = data.aws_ssm_parameter.harness_arn.value
}

output "harness_id" {
  description = "ID of the AgentCore Harness"
  value       = data.aws_ssm_parameter.harness_id.value
}
