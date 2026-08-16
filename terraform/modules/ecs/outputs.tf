output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "alb_arn" {
  value = aws_lb.this.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.frontend.repository_url
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "service_name" {
  value = aws_ecs_service.frontend.name
}

output "task_definition_arn" {
  value = aws_ecs_task_definition.frontend.arn
}
