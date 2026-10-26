#!/bin/sh
# Starts the MCP server on port 8080, either directly or behind a stdio bridge.
set -eu

PORT="${PORT:-8080}"
MODE="${MCP_MODE:-http}"
ARGS="${MCP_ARGS:-}"

if [ "$MODE" = "stdio" ]; then
  # The bridge speaks streamable HTTP on /mcp and talks stdio to the binary.
  exec supergateway \
    --stdio "/usr/local/bin/mcp-server ${ARGS}" \
    --outputTransport streamableHttp \
    --streamableHttpPath /mcp \
    --port "$PORT"
fi

# shellcheck disable=SC2086
exec /usr/local/bin/mcp-server $ARGS
