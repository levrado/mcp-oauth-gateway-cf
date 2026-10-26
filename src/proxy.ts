import { WorkerEntrypoint } from "cloudflare:workers";
import { getContainer } from "@cloudflare/containers";
import type { Env, Props } from "./env";

// Runs only for requests that carry a valid access token (OAuthProvider checks
// that first). Forwards them to the Go MCP server, which knows nothing about auth.
export class McpProxy extends WorkerEntrypoint<Env, Props> {
  async fetch(request: Request): Promise<Response> {
    // One shared container. To isolate users, use this.ctx.props.login as the name instead.
    const container = getContainer(this.env.MCP_CONTAINER, "shared");

    // The upstream must never see our bearer token.
    const headers = new Headers(request.headers);
    headers.delete("authorization");
    headers.set("x-forwarded-user", this.ctx.props.login);

    return container.fetch(new Request(request, { headers }));
  }
}
