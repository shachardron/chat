# ─────────────────────────────────────────────
# ECR Repository
# ─────────────────────────────────────────────

resource "aws_ecr_repository" "frontend" {
  name                 = "${var.project_name}-${var.environment}-frontend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-frontend"
  }
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  repository = aws_ecr_repository.frontend.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ─────────────────────────────────────────────
# ECS Cluster
# ─────────────────────────────────────────────

resource "aws_ecs_cluster" "this" {
  name = "${var.project_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}"
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# ─────────────────────────────────────────────
# CloudWatch log group
# ─────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${var.project_name}-${var.environment}-frontend"
  retention_in_days = 30
}

# ─────────────────────────────────────────────
# ECS Task Definition
# ─────────────────────────────────────────────

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${var.project_name}-${var.environment}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.container_cpu
  memory                   = var.container_memory
  execution_role_arn       = data.aws_iam_role.ecs_exec.arn
  task_role_arn            = data.aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "frontend"
    image     = "${aws_ecr_repository.frontend.repository_url}:${var.frontend_image_tag}"
    essential = true

    portMappings = [{
      containerPort = 3000
      hostPort      = 3000
      protocol      = "tcp"
    }]

    environment = [
      # AgentCore
      { name = "VITE_HARNESS_ARN",       value = var.harness_arn },
      { name = "VITE_GATEWAY_ENDPOINT",  value = var.gateway_endpoint },
      { name = "VITE_AWS_REGION",        value = var.aws_region },

      # Cognito
      { name = "VITE_COGNITO_USER_POOL_ID", value = var.cognito_user_pool_id },
      { name = "VITE_COGNITO_CLIENT_ID",    value = var.cognito_client_id },
      { name = "VITE_COGNITO_DOMAIN",       value = var.cognito_domain },
      { name = "VITE_COGNITO_REGION",       value = var.cognito_region },

      # App
      { name = "NODE_ENV", value = "production" },
      { name = "PORT",     value = "3000" }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = {
    Name = "${var.project_name}-${var.environment}-frontend"
  }
}

# Lookup the IAM roles created in the iam module
data "aws_iam_role" "ecs_exec" {
  name = "${var.project_name}-${var.environment}-ecs-exec-role"
}

data "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-${var.environment}-ecs-task-role"
}

# ─────────────────────────────────────────────
# Application Load Balancer
# ─────────────────────────────────────────────

data "aws_vpc" "this" {
  id = var.vpc_id
}

resource "aws_lb" "this" {
  name               = "${var.project_name}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = false # set true for prod

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb"
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-alb"
  }
}

data "aws_elb_service_account" "main" {}

# ALB access logs bucket
resource "aws_s3_bucket" "alb_logs" {
  bucket        = "${var.project_name}-${var.environment}-alb-logs-${var.aws_account}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = data.aws_elb_service_account.main.arn }
      Action    = "s3:PutObject"
      Resource  = "${aws_s3_bucket.alb_logs.arn}/alb/AWSLogs/${var.aws_account}/*"
    }]
  })
}

# Target group
resource "aws_lb_target_group" "frontend" {
  name        = "${var.project_name}-${var.environment}-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = {
    Name = "${var.project_name}-${var.environment}-tg"
  }
}

# HTTP → HTTPS redirect
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS listener — uses ACM cert if provided, otherwise HTTP for dev
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = var.acm_certificate_arn != "" ? "HTTPS" : "HTTP"
  ssl_policy        = var.acm_certificate_arn != "" ? "ELBSecurityPolicy-TLS13-1-2-2021-06" : null
  certificate_arn   = var.acm_certificate_arn != "" ? var.acm_certificate_arn : null

  # If no cert, fall back to port 80 HTTP for development convenience
  # (Terraform requires a listener per port; this listener serves on 443 in dev)
  dynamic "default_action" {
    for_each = var.acm_certificate_arn != "" ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.frontend.arn
    }
  }

  dynamic "default_action" {
    for_each = var.acm_certificate_arn == "" ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.frontend.arn
    }
  }
}

# ─────────────────────────────────────────────
# ECS Service
# ─────────────────────────────────────────────

resource "aws_ecs_service" "frontend" {
  name            = "${var.project_name}-${var.environment}-frontend"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 3000
  }

  deployment_controller {
    type = "ECS"
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [
    aws_lb_listener.https,
    aws_lb_listener.http
  ]

  lifecycle {
    ignore_changes = [task_definition] # updated by CI/CD
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-frontend"
  }
}

# ─────────────────────────────────────────────
# Auto Scaling
# ─────────────────────────────────────────────

resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = 10
  min_capacity       = var.desired_count
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.frontend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.project_name}-${var.environment}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
