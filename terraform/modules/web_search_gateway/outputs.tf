output "gateway_arn" {
  description = "ARN of the AgentCore Web Search Gateway (us-east-1)"
  value       = "arn:aws:bedrock-agentcore:us-east-1:${var.aws_account}:gateway/${data.aws_ssm_parameter.gateway_id.value}"
}

output "gateway_id" {
  description = "ID of the AgentCore Web Search Gateway (us-east-1)"
  value       = data.aws_ssm_parameter.gateway_id.value
}

output "gateway_endpoint" {
  description = "MCP endpoint URL of the Web Search Gateway"
  value       = data.aws_ssm_parameter.gateway_endpoint.value
}
