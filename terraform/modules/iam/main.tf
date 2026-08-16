# ─────────────────────────────────────────────
# IAM: AgentCore Harness Execution Role
#
# This role is assumed by the AgentCore service to:
#   - Call Bedrock (InvokeModel) for Claude Opus 4.7
#   - Call AgentCore Gateway (invoke tools / MCP)
#   - Write CloudWatch logs for observability
#   - Read Secrets Manager (web-search API key)
# ─────────────────────────────────────────────

resource "aws_iam_role" "harness_execution" {
  name        = "${var.project_name}-${var.environment}-harness-role"
  description = "Execution role for the AgentCore Harness - assumed by bedrock-agentcore.amazonaws.com"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "bedrock-agentcore.amazonaws.com" }
        Action    = "sts:AssumeRole"
        Condition = {
          StringEquals = { "aws:SourceAccount" = var.aws_account }
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-harness-role"
  }
}

# ── Bedrock — invoke Claude Opus 4.7 (cross-region inference profile) ──

resource "aws_iam_role_policy" "harness_bedrock" {
  name = "bedrock-invoke"
  role = aws_iam_role.harness_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "InvokeInferenceProfile"
        Effect = "Allow"
        Action = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = [
          # Inference profile ARN (cross-region routing)
          "arn:aws:bedrock:${var.aws_region}:${var.aws_account}:inference-profile/*",
          # Foundation model ARN must also be allowed (wildcard region for cross-region routing)
          "arn:aws:bedrock:*::foundation-model/anthropic.claude-*"
        ]
      },
      {
        Sid      = "ListModels"
        Effect   = "Allow"
        Action   = ["bedrock:ListFoundationModels", "bedrock:GetFoundationModel"]
        Resource = "*"
      }
    ]
  })
}

# ── AgentCore — invoke the us-east-1 Web Search Gateway ──────
# The Harness makes remote_mcp calls to the Gateway cross-region.
# Both the gateway ARN and the wildcard (* for the connector) must
# be allowed because the MCP call routes through the connector internally.

resource "aws_iam_role_policy" "harness_agentcore_gateway" {
  name = "agentcore-gateway-invoke"
  role = aws_iam_role.harness_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "InvokeWebSearchGateway"
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:InvokeGateway",
          "bedrock-agentcore:InvokeAgentRuntime"
        ]
        Resource = var.agentcore_gateway_arn != "" ? [var.agentcore_gateway_arn] : ["*"]
      },
      {
        Sid    = "InvokeWebSearchConnector"
        Effect = "Allow"
        Action = ["bedrock-agentcore:InvokeConnector"]
        # Connector lives in us-east-1 (the only region where web-search connector is available)
        Resource = "arn:aws:bedrock-agentcore:us-east-1:${var.aws_account}:connector/web-search"
      }
    ]
  })
}

# ── CloudWatch Logs — harness observability ───────────────────

resource "aws_iam_role_policy" "harness_cloudwatch" {
  name = "cloudwatch-logs"
  role = aws_iam_role.harness_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "WriteLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${var.aws_account}:log-group:/aws/bedrock-agentcore/*"
      }
    ]
  })
}

# ─────────────────────────────────────────────
# IAM: ECS Task Execution Role
#
# Used by ECS to pull ECR images and write logs.
# ─────────────────────────────────────────────

resource "aws_iam_role" "ecs_task_execution" {
  name        = "${var.project_name}-${var.environment}-ecs-exec-role"
  description = "ECS task execution role - used by ECS agent, not the application"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow ECS to read app secrets (Cognito client IDs, harness ARN, etc.)
resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name = "read-app-secrets"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "ssm:GetParameters"]
      Resource = [
        "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account}:secret:${var.project_name}/*",
        "arn:aws:ssm:${var.aws_region}:${var.aws_account}:parameter/${var.project_name}/*"
      ]
    }]
  })
}

# ─────────────────────────────────────────────
# IAM: ECS Task Role
#
# Permissions available to the running container.
# The frontend calls AgentCore on behalf of authenticated users,
# so it only needs to invoke the harness.
# ─────────────────────────────────────────────

resource "aws_iam_role" "ecs_task" {
  name        = "${var.project_name}-${var.environment}-ecs-task-role"
  description = "Runtime permissions for the frontend container"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_invoke_harness" {
  name = "invoke-harness"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "InvokeHarness"
      Effect = "Allow"
      Action = [
        "bedrock-agentcore:InvokeHarness",
        "bedrock-agentcore:InvokeAgentRuntime"
      ]
      Resource = "*"
    }]
  })
}
