# ─────────────────────────────────────────────
# AgentCore Harness  (eu-central-1)
#
# The hashicorp/aws provider (v5.x) does not yet include AgentCore
# Harness resources. We provision via AWS CLI (null_resource + local-exec)
# and persist outputs to SSM Parameter Store.
# ─────────────────────────────────────────────

locals {
  # Extract Cognito User Pool ID from issuer URL
  cognito_user_pool_id = split("/", var.cognito_issuer_url)[length(split("/", var.cognito_issuer_url)) - 1]

  # Harness name: only [a-zA-Z][a-zA-Z0-9_]{0,39} — replace hyphens with underscores
  harness_name = replace("${var.project_name}_${var.environment}", "-", "_")
  ssm_base     = "/${var.project_name}/${var.environment}/agentcore"
}

resource "null_resource" "harness" {
  triggers = {
    harness_name               = local.harness_name
    model_id                   = var.model_id
    execution_role_arn         = var.harness_execution_role_arn
    web_search_gateway_endpoint = var.web_search_gateway_endpoint
    cognito_issuer_url         = var.cognito_issuer_url
    cognito_client_id          = var.cognito_client_id
  }

  provisioner "local-exec" {
    interpreter = ["powershell", "-Command"]
    command     = <<-PWSH
      $name       = "${local.harness_name}"
      $roleArn    = "${var.harness_execution_role_arn}"
      $modelId    = "${var.model_id}"
      $gwEndpoint = "${var.web_search_gateway_endpoint}"
      $issuerUrl  = "${var.cognito_issuer_url}"
      $clientId   = "${var.cognito_client_id}"
      $region     = "${var.aws_region}"
      $ssmBase    = "${local.ssm_base}"

      # Idempotent: skip if already created
      $existing = aws ssm get-parameter --name "$ssmBase/harness-id" --region $region --query Parameter.Value --output text 2>$null
      if ($LASTEXITCODE -eq 0 -and $existing) {
        Write-Host "Harness already exists: $existing — skipping creation"
        exit 0
      }

      $tmpDir  = [System.IO.Path]::GetTempPath()
      $noBomUtf8 = [System.Text.UTF8Encoding]::new($false)

      # Single CLI-input-json file for create-harness
      $createFile = "$tmpDir\harness-create.json"
      $createJson = '{"harnessName":"' + $name + '","executionRoleArn":"' + $roleArn + '","model":{"bedrockModelConfig":{"modelId":"' + $modelId + '","maxTokens":4096,"temperature":0.7,"topP":0.9,"apiFormat":"converse_stream"}},"systemPrompt":[{"text":"You are a helpful AI assistant powered by Claude Opus 4.7. Use the web search tool for current events, recent news, prices, or anything after your training cutoff. Cite sources with URLs."}],"tools":[{"type":"remote_mcp","name":"web-search","config":{"remoteMcp":{"url":"' + $gwEndpoint + '"}}}],"memory":{"managedMemoryConfiguration":{}},"authorizerConfiguration":{"customJWTAuthorizer":{"discoveryUrl":"' + $issuerUrl + '/.well-known/openid-configuration","allowedClients":["' + $clientId + '"],"allowedAudience":["' + $clientId + '"]}},"maxIterations":20,"maxTokens":8192,"timeoutSeconds":300}'
      [System.IO.File]::WriteAllText($createFile, $createJson, $noBomUtf8)

      $resultJson = aws bedrock-agentcore-control create-harness `
        --cli-input-json "file://$createFile" `
        --region $region `
        --output json 2>&1

      Remove-Item $createFile -ErrorAction SilentlyContinue

      Write-Host "AWS response: $resultJson"
      $result = $resultJson | ConvertFrom-Json -ErrorAction SilentlyContinue

      # Response is nested under a "harness" key
      $h = if ($result.harness) { $result.harness } else { $result }

      if (-not $h -or -not $h.harnessId) {
        Write-Host "ERROR: create-harness failed. Full response above."
        exit 1
      }

      aws ssm put-parameter --name "$ssmBase/harness-id"  --value $h.harnessId  --type String --region $region --overwrite
      aws ssm put-parameter --name "$ssmBase/harness-arn" --value $h.arn        --type String --region $region --overwrite

      Write-Host "Created harness: $($h.harnessId)"
    PWSH
  }
}

# Poll until READY and persist the final ARN

resource "null_resource" "harness_ready" {
  triggers = {
    harness_null_id = null_resource.harness.id
  }

  provisioner "local-exec" {
    interpreter = ["powershell", "-Command"]
    command     = <<-PWSH
      $region  = "${var.aws_region}"
      $ssmBase = "${local.ssm_base}"

      $harnessId = aws ssm get-parameter --name "$ssmBase/harness-id" --region $region --query Parameter.Value --output text 2>$null
      if ($LASTEXITCODE -ne 0 -or -not $harnessId) {
        Write-Host "ERROR: Harness ID not found in SSM - harness creation may have failed"
        exit 1
      }

      # Poll until READY (max 10 min)
      $ready = $false
      for ($i = 0; $i -lt 60; $i++) {
        $resp = aws bedrock-agentcore-control get-harness --harness-id $harnessId --region $region --output json | ConvertFrom-Json
        $h = if ($resp.harness) { $resp.harness } else { $resp }
        Write-Host "Harness status: $($h.status)"
        if ($h.status -eq "READY") { $ready = $true; break }
        if ($h.status -match "FAILED") { Write-Host "ERROR: Harness creation failed: $($h.status)"; exit 1 }
        Start-Sleep -Seconds 10
      }
      if (-not $ready) {
        Write-Host "ERROR: Harness did not become READY within 10 minutes"
        exit 1
      }

      Write-Host "Harness is READY: $harnessId"
    PWSH
  }

  depends_on = [null_resource.harness]
}

# Read back from SSM

data "aws_ssm_parameter" "harness_id" {
  name       = "/${var.project_name}/${var.environment}/agentcore/harness-id"
  depends_on = [null_resource.harness_ready]
}

data "aws_ssm_parameter" "harness_arn" {
  name       = "/${var.project_name}/${var.environment}/agentcore/harness-arn"
  depends_on = [null_resource.harness_ready]
}

# ── CloudWatch log group ──────────────────────

resource "aws_cloudwatch_log_group" "harness" {
  name              = "/aws/bedrock-agentcore/${var.project_name}-${var.environment}"
  retention_in_days = 30
}
