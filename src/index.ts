import OAuthProvider from "@cloudflare/workers-oauth-provider";
import login from "./login";
import { McpProxy } from "./proxy";

// Durable Object classes must be exported from the entry module.
export { McpContainer } from "./container";

// OAuthProvider is the whole Worker. It:
//   - serves /.well-known/*, /register, /token (the OAuth 2.1 server MCP clients expect)
//   - sends /authorize to our login handler
//   - checks the bearer token on /mcp, then calls McpProxy
export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: McpProxy,
  defaultHandler: login,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
