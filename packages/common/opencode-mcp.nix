# Shared OpenCode MCP server map. Profiles may remove entries (e.g. headless hosts
# drop Chrome DevTools) without re-listing the full table.
{
  "Chrome DevTools" = {
    type = "local";
    command = [
      "bunx"
      "chrome-devtools-mcp@latest"
      "-y"
    ];
  };
  "Cloudflare" = {
    type = "remote";
    url = "https://mcp.cloudflare.com/mcp";
    oauth = { };
  };
  "Cloudflare Bindings" = {
    type = "remote";
    url = "https://bindings.mcp.cloudflare.com/mcp";
    oauth = { };
  };
  "Cloudflare Builds" = {
    type = "remote";
    url = "https://builds.mcp.cloudflare.com/mcp";
    oauth = { };
  };
  "Cloudflare Docs" = {
    type = "remote";
    url = "https://docs.mcp.cloudflare.com/mcp";
    oauth = { };
  };
  "Cloudflare Observability" = {
    type = "remote";
    url = "https://observability.mcp.cloudflare.com/mcp";
    oauth = { };
  };
  "Machine Memory" = {
    type = "remote";
    url = "https://machine-memory.jfa.dev/mcp";
    oauth = { };
  };
}
