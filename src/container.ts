import { Container } from "@cloudflare/containers";

// Durable Object that owns one running instance of the Go MCP server.
// The Worker reaches it with getContainer(env.MCP_CONTAINER, "<name>").
export class McpContainer extends Container {
  // Port the server listens on inside the container (see start.sh).
  defaultPort = 8080;

  // Stop the container after this long without requests.
  sleepAfter = "10m";

  // Passed to start.sh. Change MCP_MODE to "stdio" if the server has no HTTP transport.
  envVars = {
    MCP_MODE: "http",
    MCP_ARGS: "",
  };
}
