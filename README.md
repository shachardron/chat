# Bedrock Chat

A production-ready AI chat application built on:

| Layer | Technology |
|-------|-----------|
| Model | Claude Opus 4.7 via Amazon Bedrock (cross-region inference profile) |
| Agent loop | AWS AgentCore Harness (managed, no orchestration code) |
| Web search | AgentCore Gateway → Brave Search API (MCP tool) |
| MCP / agent tools | AgentCore Gateway (add more targets without code changes) |
| Authentication | Amazon Cognito (Hosted UI, authorization-code flow, JWT) |
| Frontend | React 18 + Vite + Tailwind CSS, streaming SSE |
| Hosting | ECS Fargate behind an Application Load Balancer |
| Infrastructure | Terraform ≥ 1.6 |

---

## Architecture overview

```
Browser
  │  HTTPS (ALB)
  ▼
ECS Fargate  (React SPA + Node server)
  │  POST /runtimes/<harnessArn>/sessions/<id>/invoke
  │  Authorization: Bearer <Cognito ID token>
  ▼
AgentCore Harness  (Claude Opus 4.7, JWT-authenticated)
  │
  ├─► AgentCore Gateway  (MCP endpoint)
  │       └─► Brave Search REST API  (web search tool)
  │       └─► (add more MCP targets here)
  │
  └─► Amazon Bedrock  (us.anthropic.claude-opus-4-5-20251101-v1:0)
```

Authentication flow:

```
Browser → Cognito Hosted UI → authorization code → /callback
        → token exchange → ID token stored in sessionStorage
        → ID token attached as Bearer on every Harness invocation
        → Harness validates JWT against Cognito JWKS endpoint
```

---

## Prerequisites

- Terraform ≥ 1.6
- AWS CLI v2 configured with credentials that can create IAM, VPC, ECS, Bedrock, Cognito, and AgentCore resources
- Docker (for building and pushing the frontend image)
- Node.js ≥ 20 (local development only)
- A [Brave Search API key](https://api.search.brave.com/) for the web-search tool

---

## Deployment steps

### 1. Store the Brave Search API key in Secrets Manager

```bash
aws secretsmanager create-secret \
  --name "bedrock-chat/brave-api-key" \
  --secret-string '{"api_key":"YOUR_BRAVE_API_KEY"}' \
  --region us-east-1
```

Note the ARN from the output — you'll need it in step 3.

### 2. Enable Claude Opus 4.7 model access

In the [Bedrock console](https://console.aws.amazon.com/bedrock/home#/modelaccess), request access to:
- `anthropic.claude-opus-4-5` (Anthropic Claude Opus 4.7)

Or via CLI:
```bash
aws bedrock put-use-case-for-model-access \
  --model-id anthropic.claude-opus-4-5 \
  --region us-east-1
```

Verify the cross-region inference profile is available:
```bash
aws bedrock list-inference-profiles --region us-east-1 \
  | grep -i opus
```

### 3. Configure Terraform variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — fill in aws_region, web_search_api_key_secret_arn, etc.
```

### 4. First apply (bootstrap infrastructure)

```bash
cd terraform
terraform init
terraform apply
```

After the first apply, note the `alb_dns_name` output. Update `terraform.tfvars`:

```hcl
cognito_callback_urls = ["https://<alb_dns_name>/callback"]
cognito_logout_urls   = ["https://<alb_dns_name>/logout"]
```

Run apply again to update the Cognito app client:
```bash
terraform apply
```

### 5. Build and push the frontend Docker image

```bash
# Get values from Terraform outputs
ECR_URL=$(terraform -chdir=terraform output -raw ecr_repository_url)
REGION=$(terraform -chdir=terraform output -raw aws_region 2>/dev/null || echo "us-east-1")

# Authenticate Docker to ECR
aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin $ECR_URL

# Build and push (builds for linux/arm64 — Graviton Fargate)
cd frontend
docker buildx build \
  --platform linux/arm64 \
  --build-arg VITE_AWS_REGION=$REGION \
  --build-arg VITE_HARNESS_ARN=$(terraform -chdir=../terraform output -raw harness_arn) \
  --build-arg VITE_COGNITO_USER_POOL_ID=$(terraform -chdir=../terraform output -raw cognito_user_pool_id) \
  --build-arg VITE_COGNITO_CLIENT_ID=$(terraform -chdir=../terraform output -raw cognito_client_id) \
  --build-arg VITE_COGNITO_DOMAIN=$(terraform -chdir=../terraform output -raw cognito_domain) \
  --build-arg VITE_COGNITO_REGION=$REGION \
  --build-arg VITE_GATEWAY_ENDPOINT=$(terraform -chdir=../terraform output -raw gateway_endpoint) \
  -t $ECR_URL:latest \
  --push \
  .
```

### 6. Final apply to update the ECS task with the new image

```bash
cd terraform
terraform apply
```

Or force a new ECS deployment without a Terraform apply:
```bash
aws ecs update-service \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_name) \
  --force-new-deployment \
  --region us-east-1
```

### 7. Access the application

```bash
echo "https://$(terraform output -raw alb_dns_name)"
```

Open the URL in a browser. You'll be redirected to the Cognito Hosted UI to sign in.

---

## Adding MCP tools / agent targets

The AgentCore Gateway can expose any REST API as an MCP tool. To add a new tool:

1. Write an OpenAPI 3.x schema describing the API operations.
2. Upload it to the `<project>-gateway-schemas` S3 bucket.
3. Add a new `aws_bedrockagentcore_gateway_target` resource in `terraform/modules/agentcore/main.tf`.
4. Run `terraform apply`.

The Harness automatically discovers new tools via the Gateway — no redeploy needed.

---

## Adding external MCP servers

To connect a third-party MCP server (e.g. a GitHub MCP server):

```hcl
# In terraform/modules/agentcore/main.tf, add to the harness tools list:
{
  type = "remote_mcp"
  name = "github-mcp"
  config = {
    remoteMcp = {
      url = "https://your-mcp-server.example.com/mcp"
    }
  }
}
```

---

## Local development

```bash
cd frontend
npm install

# Copy and fill in your local values
cat > .env.local << 'EOF'
VITE_AWS_REGION=us-east-1
VITE_HARNESS_ARN=arn:aws:bedrock-agentcore:us-east-1:123456789012:harness/xxxxx
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXX
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COGNITO_DOMAIN=bedrock-chat-dev-xxxxxx
VITE_COGNITO_REGION=us-east-1
VITE_GATEWAY_ENDPOINT=https://xxxxxxxx.gateway.bedrock-agentcore.us-east-1.amazonaws.com
EOF

npm run dev
# → http://localhost:3000
```

For Cognito callback to work locally, add `http://localhost:3000/callback` to the Cognito app client's allowed callback URLs (update `cognito_callback_urls` in `terraform.tfvars`).

---

## Project structure

```
bedrock-chat/
├── terraform/
│   ├── main.tf               # Root module — wires all modules together
│   ├── variables.tf          # Input variables
│   ├── outputs.tf            # Output values
│   ├── terraform.tfvars.example
│   └── modules/
│       ├── vpc/              # VPC, subnets, NAT, security groups, flow logs
│       ├── cognito/          # User Pool, Hosted UI, App Client
│       ├── iam/              # Harness execution role, ECS roles
│       ├── agentcore/        # AgentCore Gateway + Harness
│       └── ecs/              # ECR, ECS Fargate, ALB, auto-scaling
└── frontend/
    ├── Dockerfile            # Multi-stage build (builder + runner)
    ├── server.mjs            # Production Node server (/health + SPA fallback)
    ├── src/
    │   ├── App.tsx           # Routing (login / callback / logout / chat)
    │   ├── lib/
    │   │   ├── auth.ts       # Cognito auth helpers
    │   │   ├── harness.ts    # AgentCore Harness streaming client
    │   │   └── config.ts     # Runtime configuration
    │   ├── hooks/
    │   │   └── useChat.ts    # Conversation state + streaming
    │   └── components/
    │       ├── ChatPage.tsx       # Main chat UI
    │       ├── MessageBubble.tsx  # Markdown-rendered messages
    │       ├── ChatInput.tsx      # Textarea + send/stop buttons
    │       ├── LoginPage.tsx
    │       ├── CallbackPage.tsx
    │       └── LogoutPage.tsx
    └── public/
```

---

## Security notes

- The Cognito ID token is stored in `sessionStorage` (not `localStorage`) and never sent server-side.
- The Node production server sets `Content-Security-Policy`, `X-Frame-Options`, and other security headers.
- The ECS container runs as a non-root user.
- The Harness execution role uses confused-deputy conditions (`aws:SourceArn`, `aws:SourceAccount`).
- VPC Flow Logs are enabled for network audit.
- ECS tasks run in private subnets; only the ALB is internet-facing.
- Before production: enable `enable_deletion_protection = true` on the ALB and set Cognito advanced security to `ENFORCED`.

---

## Tear down

```bash
cd terraform
terraform destroy
```

Note: ECR images and S3 objects are deleted automatically because `force_destroy = true` is set on those resources. Remove that flag before going to production.
