// The "defaultHandler": everything that is not the MCP route or an OAuth
// endpoint. Here it implements the browser sign-in step by delegating to GitHub.
//
//   MCP client -> /authorize -> GitHub -> /callback -> back to the MCP client
//
// Swap the GitHub calls for any other identity provider if you prefer.

import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { Env, Props } from "./env";

const STATE_TTL_SECONDS = 600;
const COOKIE = "oauth_state";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/authorize") return startLogin(request, env);
    if (url.pathname === "/callback") return finishLogin(request, env);
    if (url.pathname === "/") return new Response("MCP gateway is running.");
    return new Response("Not found", { status: 404 });
  },
};

// Step A: the MCP client sent the user here. Remember its request, then bounce to GitHub.
async function startLogin(request: Request, env: Env): Promise<Response> {
  const oauthReq = await env.OAUTH_PROVIDER.parseAuthRequest(request);

  // Fail early if the client id is unknown (it registers via /register).
  const client = await env.OAUTH_PROVIDER.lookupClient(oauthReq.clientId);
  if (!client) return new Response("Unknown client", { status: 400 });

  // Park the MCP client's request in KV under a random state, and bind that
  // state to this browser with a cookie so a stolen callback URL is useless.
  const state = crypto.randomUUID();
  await env.OAUTH_KV.put(`login:${state}`, JSON.stringify(oauthReq), {
    expirationTtl: STATE_TTL_SECONDS,
  });

  const github = new URL("https://github.com/login/oauth/authorize");
  github.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  github.searchParams.set("redirect_uri", new URL("/callback", request.url).href);
  github.searchParams.set("scope", "read:user");
  github.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      location: github.href,
      "set-cookie": `${COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${STATE_TTL_SECONDS}`,
    },
  });
}

// Step B: GitHub sent the user back. Verify, check the allowlist, finish the MCP client's grant.
async function finishLogin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return new Response("Missing code or state", { status: 400 });

  const cookieState = request.headers.get("cookie")?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1];
  if (cookieState !== state) return new Response("State mismatch", { status: 400 });

  const stored = await env.OAUTH_KV.get(`login:${state}`);
  if (!stored) return new Response("Login expired, start again", { status: 400 });
  await env.OAUTH_KV.delete(`login:${state}`); // single use
  const oauthReq = JSON.parse(stored) as AuthRequest;

  // Exchange the GitHub code for a GitHub token, then ask who the user is.
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return new Response("GitHub token exchange failed", { status: 502 });

  const userRes = await fetch("https://api.github.com/user", {
    headers: { authorization: `Bearer ${access_token}`, "user-agent": "mcp-oauth-gateway" },
  });
  const { login } = (await userRes.json()) as { login?: string };
  if (!login) return new Response("Could not read GitHub user", { status: 502 });

  const allowed = env.ALLOWED_GITHUB_USERS.split(",").map((s) => s.trim().toLowerCase());
  if (!allowed.includes(login.toLowerCase())) {
    return new Response(`${login} is not allowed`, { status: 403 });
  }

  // Hand control back to the MCP client with an authorization code. The library
  // issues the access/refresh tokens; `props` is what the proxy sees later.
  const props: Props = { login };
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReq,
    userId: login,
    metadata: { label: login },
    scope: oauthReq.scope,
    props,
  });

  return new Response(null, {
    status: 302,
    headers: {
      location: redirectTo,
      "set-cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    },
  });
}
