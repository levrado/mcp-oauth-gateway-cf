# mcp-oauth-gateway

Put OAuth in front of a third-party MCP server written in Go, **without changing its code**.

```
MCP client ──► Worker (OAuthProvider) ──► Durable Object ──► container
               - OAuth 2.1 server         McpContainer       Go MCP server (unmodified)
               - GitHub sign-in           (starts/stops it)  speaks plain HTTP
               - checks bearer token
```

The Worker owns authentication. The Go server only ever sees plain, already-authorized requests.

## How a request flows

1. A client calls `POST /mcp` with no token and gets `401` plus discovery metadata.
2. It registers itself at `/register`, then sends the user to `/authorize`.
3. `src/login.ts` redirects to GitHub, checks the user against `ALLOWED_GITHUB_USERS`, and finishes the grant.
4. The client trades the code at `/token` and receives an access token.
5. `/mcp` calls with that token reach `src/proxy.ts`, which strips the `Authorization` header and forwards to the container.

## Files

| File | Role |
| --- | --- |
| `src/index.ts` | Wires `OAuthProvider` to the routes |
| `src/login.ts` | Browser sign-in (GitHub) and grant completion |
| `src/proxy.ts` | Authenticated requests are forwarded to the container |
| `src/container.ts` | Durable Object class that runs the container |
| `Dockerfile`, `start.sh` | Build and launch the Go binary |
| `wrangler.jsonc` | Bindings, container, KV, vars |

## Setup, in order

### 1. Install

```sh
npm install
```

Dependencies use `latest`; pin them to the installed versions once it works.

### 2. Point the Dockerfile at the Go server

Edit the `ARG` defaults in `Dockerfile`:

- `MCP_REPO`: git URL of the server
- `MCP_REF`: tag or commit (pin a tag, not `main`)
- `MCP_PKG`: package path that contains `main`, e.g. `./cmd/server`

Then pick how it talks, in `src/container.ts`:

- Server has an HTTP / streamable-HTTP transport: keep `MCP_MODE: "http"` and put its flags in `MCP_ARGS` (for example `--transport http --port 8080`). It must listen on **8080** and serve MCP at **`/mcp`**; if its path or port differs, change `defaultPort` or the `apiRoute`.
- Server is stdio-only: set `MCP_MODE: "stdio"`. `start.sh` wraps it with `supergateway`, which exposes it at `/mcp`.

### 3. Create the KV namespace

```sh
npx wrangler kv namespace create OAUTH_KV
```

Paste the printed `id` into `wrangler.jsonc`.

### 4. Create a GitHub OAuth app

GitHub → Settings → Developer settings → OAuth Apps → New.

- Homepage URL: `https://<your-worker>.workers.dev`
- Authorization callback URL: `https://<your-worker>.workers.dev/callback`

Put the client id in `GITHUB_CLIENT_ID` and your login in `ALLOWED_GITHUB_USERS` (both in `wrangler.jsonc`). Then:

```sh
npx wrangler secret put GITHUB_CLIENT_SECRET
```

### 5. Deploy

```sh
npm run deploy
```

Docker must be running locally; Wrangler builds the image and pushes it. The first deploy takes a few minutes while the container rolls out.

### 6. Connect a client

Add `https://<your-worker>.workers.dev/mcp` as a remote MCP server in your client. It will open a browser for GitHub sign-in.

## Notes and choices

- **One shared container.** `proxy.ts` uses a single named instance. Use `this.ctx.props.login` as the name for one container per user.
- **Identity header.** The upstream receives `x-forwarded-user` with the GitHub login. Ignore it if the server doesn't need it.
- **Skipped consent screen.** `login.ts` goes straight from GitHub back to the client. If you allow open client registration and more than one user, add a consent page so users approve each new client.
- **Different identity provider.** Replace the two GitHub calls in `login.ts`; nothing else changes.
- **Cold starts.** The container sleeps after `sleepAfter` (10 minutes) and starts on the next request, which adds a few seconds to that first call.
- **Local dev.** `npm run dev` also needs Docker. `GITHUB_CLIENT_SECRET` goes in `.dev.vars`.
- **Not tested.** This was written from the library docs, not run. Check the `@cloudflare/workers-oauth-provider` and `@cloudflare/containers` READMEs if an API name has drifted.
