import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { McpContainer } from "./container";

export interface Env {
  // Bindings (wrangler.jsonc)
  OAUTH_KV: KVNamespace;
  MCP_CONTAINER: DurableObjectNamespace<McpContainer>;
  // Injected by OAuthProvider at request time.
  OAUTH_PROVIDER: OAuthHelpers;

  // Vars (wrangler.jsonc)
  GITHUB_CLIENT_ID: string;
  ALLOWED_GITHUB_USERS: string;

  // Secrets (`wrangler secret put`)
  GITHUB_CLIENT_SECRET: string;
}

// What we attach to each issued token; available as ctx.props in the proxy.
export interface Props extends Record<string, unknown> {
  login: string;
}
