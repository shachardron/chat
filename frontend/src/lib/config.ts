/**
 * Runtime configuration — values are injected via environment variables
 * at build time (Vite VITE_* prefix) or at runtime via the ECS task env.
 */
/// <reference types="vite/client" />

function required(key: string): string {
  const value = import.meta.env[key] as string | undefined
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function optional(key: string, fallback = ''): string {
  return (import.meta.env[key] as string | undefined) ?? fallback
}

export const config = {
  aws: {
    region: required('VITE_AWS_REGION'),
  },
  agentcore: {
    harnessArn:      required('VITE_HARNESS_ARN'),
    gatewayEndpoint: optional('VITE_GATEWAY_ENDPOINT'),
  },
  cognito: {
    userPoolId: required('VITE_COGNITO_USER_POOL_ID'),
    clientId:   required('VITE_COGNITO_CLIENT_ID'),
    domain:     required('VITE_COGNITO_DOMAIN'),
    region:     required('VITE_COGNITO_REGION'),
  },
} as const

export type Config = typeof config
