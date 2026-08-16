terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

# ─────────────────────────────────────────────
# AgentCore Web Search Gateway  (us-east-1)
#
# The hashicorp/aws provider (v5.x) does not yet include AgentCore
# resources (gateway, harness). We provision them via AWS CLI using
# null_resource + local-exec and store the resulting ARNs/endpoints
# in SSM Parameter Store so other modules can read them as data sources.
# ─────────────────────────────────────────────

# ── IAM role for the Gateway service ─────────

resource "aws_iam_role" "gateway" {
  name        = "${var.project_name}-${var.environment}-ws-gateway-role"
  description = "Service role for the AgentCore Web Search Gateway (us-east-1)"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "bedrock-agentcore.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = var.aws_account }
        ArnLike = {
          "aws:SourceArn" = "arn:aws:bedrock-agentcore:us-east-1:${var.aws_account}:gateway/*"
        }
      }
    }]
  })

  tags = { Name = "${var.project_name}-${var.environment}-ws-gateway-role" }
}

resource "aws_iam_role_policy" "gateway_web_search" {
  name = "invoke-web-search-connector"
  role = aws_iam_role.gateway.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "InvokeGateway"
        Effect   = "Allow"
        Action   = "bedrock-agentcore:InvokeGateway"
        Resource = "arn:aws:bedrock-agentcore:us-east-1:${var.aws_account}:gateway/*"
      },
      {
        Sid      = "InvokeWebSearch"
        Effect   = "Allow"
        Action   = "bedrock-agentcore:InvokeWebSearch"
        Resource = "arn:aws:bedrock-agentcore:us-east-1:aws:tool/web-search.v1"
      }
    ]
  })
}

# ── Create the Gateway via AWS CLI ────────────
# Idempotent: checks SSM before creating to avoid duplicates on re-apply.

resource "null_resource" "gateway" {
  triggers = {
    gateway_name       = "${var.project_name}-${var.environment}-web-search-gw"
    role_arn           = aws_iam_role.gateway.arn
    aws_account        = var.aws_account
    cognito_issuer_url = var.cognito_issuer_url
    cognito_client_id  = var.cognito_client_id
  }

  provisioner "local-exec" {
    interpreter = ["powershell", "-Command"]
    command     = <<-PWSH
      $name      = "${var.project_name}-${var.environment}-web-search-gw"
      $roleArn   = "${aws_iam_role.gateway.arn}"
      $param     = "/${var.project_name}/${var.environment}/agentcore/web-search-gateway-id"
      $issuerUrl = "${var.cognito_issuer_url}"
      $clientId  = "${var.cognito_client_id}"

      # Idempotent: skip if already created
      $existing = aws ssm get-parameter --name $param --region us-east-1 --query Parameter.Value --output text 2>$null
      if ($LASTEXITCODE -eq 0 -and $existing) {
        Write-Host "Gateway already exists: $existing"
        exit 0
      }

      # Write JSON to a temp file (explicit no-BOM encoding)
      $tmpFile = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', '.json'
      $noBomUtf8 = [System.Text.UTF8Encoding]::new($false)
      $jsonContent = '{"authorizerType":"CUSTOM_JWT","authorizerConfiguration":{"customJWTAuthorizer":{"discoveryUrl":"' + $issuerUrl + '/.well-known/openid-configuration","allowedClients":["' + $clientId + '"],"allowedAudience":["' + $clientId + '"]}},"name":"' + $name + '","roleArn":"' + $roleArn + '"}'
      [System.IO.File]::WriteAllText($tmpFile, $jsonContent, $noBomUtf8)

      $resultJson = aws bedrock-agentcore-control create-gateway `
        --cli-input-json "file://$tmpFile" `
        --region us-east-1 `
        --output json 2>&1

      Remove-Item $tmpFile -ErrorAction SilentlyContinue

      Write-Host "AWS response: $resultJson"

      $result = $resultJson | ConvertFrom-Json -ErrorAction SilentlyContinue
      if (-not $result -or -not $result.gatewayId) {
        Write-Host "ERROR: create-gateway failed. Full response above."
        exit 1
      }

      aws ssm put-parameter --name $param --value $result.gatewayId --type String --region us-east-1 --overwrite
      Write-Host "Created gateway: $($result.gatewayId)"
    PWSH
  }

  depends_on = [aws_iam_role_policy.gateway_web_search]
}

# ── Create the Web Search target via AWS CLI ──

resource "null_resource" "gateway_target" {
  triggers = {
    gateway_null_id = null_resource.gateway.id
  }

  provisioner "local-exec" {
    interpreter = ["powershell", "-Command"]
    command     = <<-PWSH
      $gwParam     = "/${var.project_name}/${var.environment}/agentcore/web-search-gateway-id"
      $targetParam = "/${var.project_name}/${var.environment}/agentcore/web-search-target-id"

      $gatewayId = aws ssm get-parameter --name $gwParam --region us-east-1 --query Parameter.Value --output text
      if (-not $gatewayId) { Write-Host "ERROR: Gateway ID not found in SSM"; exit 1 }

      # Idempotent
      $existing = aws ssm get-parameter --name $targetParam --region us-east-1 --query Parameter.Value --output text 2>$null
      if ($LASTEXITCODE -eq 0 -and $existing) {
        Write-Host "Gateway target already exists: $existing"
        exit 0
      }

      $noBomUtf8  = [System.Text.UTF8Encoding]::new($false)
      $targetFile = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', '.json'
      $targetJson = '{"gatewayIdentifier":"' + $gatewayId + '","name":"web-search","targetConfiguration":{"mcp":{"connector":{"source":{"connectorId":"web-search","version":"1.2.0"},"configurations":[{"name":"WebSearch","parameterValues":{}}]}}},"credentialProviderConfigurations":[{"credentialProviderType":"GATEWAY_IAM_ROLE"}]}'
      [System.IO.File]::WriteAllText($targetFile, $targetJson, $noBomUtf8)

      $resultJson = aws bedrock-agentcore-control create-gateway-target `
        --cli-input-json "file://$targetFile" `
        --region us-east-1 `
        --output json 2>&1

      Remove-Item $targetFile -ErrorAction SilentlyContinue

      Write-Host "AWS response: $resultJson"
      $result = $resultJson | ConvertFrom-Json -ErrorAction SilentlyContinue

      # The response field may be targetId or id depending on CLI version
      $tId = if ($result.targetId) { $result.targetId } elseif ($result.id) { $result.id } else { $null }
      if (-not $result -or -not $tId) {
        Write-Host "ERROR: create-gateway-target failed. Full response above."
        exit 1
      }

      aws ssm put-parameter --name $targetParam --value $tId --type String --region us-east-1 --overwrite
      Write-Host "Created gateway target: $tId"
    PWSH
  }

  depends_on = [null_resource.gateway]
}

# ── Store the Gateway endpoint in SSM ─────────

resource "null_resource" "gateway_endpoint" {
  triggers = {
    target_null_id = null_resource.gateway_target.id
  }

  provisioner "local-exec" {
    interpreter = ["powershell", "-Command"]
    command     = <<-PWSH
      $gwParam       = "/${var.project_name}/${var.environment}/agentcore/web-search-gateway-id"
      $endpointParam = "/${var.project_name}/${var.environment}/agentcore/web-search-gateway-endpoint"

      $gatewayId = aws ssm get-parameter --name $gwParam --region us-east-1 --query Parameter.Value --output text

      # Poll until READY (max 5 min)
      $ready = $false
      for ($i = 0; $i -lt 30; $i++) {
        $gw = aws bedrock-agentcore-control get-gateway --gateway-identifier $gatewayId --region us-east-1 --output json | ConvertFrom-Json
        if ($gw.status -eq "READY") { $ready = $true; break }
        Write-Host "Gateway status: $($gw.status) - waiting..."
        Start-Sleep -Seconds 10
      }
      if (-not $ready) {
        Write-Host "ERROR: Gateway did not become READY in time"
        exit 1
      }

      $endpoint = $gw.gatewayUrl
      if (-not $endpoint) {
        Write-Host "ERROR: gatewayUrl is empty in get-gateway response"
        Write-Host "Full response: $($gw | ConvertTo-Json -Compress)"
        exit 1
      }
      aws ssm put-parameter --name $endpointParam --value $endpoint --type String --region us-east-1 --overwrite
      Write-Host "Gateway endpoint: $endpoint"
    PWSH
  }

  depends_on = [null_resource.gateway_target]
}

# ── Read the endpoint back from SSM ──────────

data "aws_ssm_parameter" "gateway_endpoint" {
  name = "/${var.project_name}/${var.environment}/agentcore/web-search-gateway-endpoint"

  depends_on = [null_resource.gateway_endpoint]
}

data "aws_ssm_parameter" "gateway_id" {
  name = "/${var.project_name}/${var.environment}/agentcore/web-search-gateway-id"

  depends_on = [null_resource.gateway]
}

# ── CloudWatch log group ──────────────────────

resource "aws_cloudwatch_log_group" "gateway" {
  name              = "/aws/bedrock-agentcore/${var.project_name}-${var.environment}-web-search-gw"
  retention_in_days = 30
}
