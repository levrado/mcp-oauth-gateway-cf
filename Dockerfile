# Container image that runs the third-party Go MCP server, unmodified.
#
# Build args (edit the defaults, or override in wrangler.jsonc via image_vars):
#   MCP_REPO  git URL of the MCP server
#   MCP_REF   tag/branch/commit to build
#   MCP_PKG   Go package path to build, relative to the repo root
#
# Runtime env (set in src/container.ts):
#   MCP_MODE  "http"  -> the server speaks HTTP itself; run it directly
#             "stdio" -> the server only speaks stdio; wrap it with a bridge
#   MCP_ARGS  arguments passed to the server binary

FROM golang:1.23 AS build
ARG MCP_REPO=https://github.com/example/mcp-server.git
ARG MCP_REF=main
ARG MCP_PKG=./cmd/server
WORKDIR /src
RUN git clone --depth 1 --branch "${MCP_REF}" "${MCP_REPO}" .
RUN CGO_ENABLED=0 go build -o /out/mcp-server "${MCP_PKG}"

FROM node:22-slim
# Node is only needed for the stdio bridge; drop it if MCP_MODE is always "http".
RUN npm install -g supergateway
COPY --from=build /out/mcp-server /usr/local/bin/mcp-server
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh
EXPOSE 8080
CMD ["/usr/local/bin/start.sh"]
