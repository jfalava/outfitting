import { Hono } from "hono";

const app = new Hono();

app.get("*", async (c) => {
  const wslScriptUrl =
    "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/wsl-install-script.sh";
  const windowsScriptUrl =
    "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/windows-install-script.ps1";
  const linuxScriptUrl =
    "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/apt-desktop-install-script.sh";
  const repoUrl = "https://github.com/jfalava/outfitting";

  const hostHeader = c.req.header("Host") || "";
  console.log("Host Header:", hostHeader);

  let scriptUrl: string;
  if (hostHeader.includes("wsl.jfa.dev")) {
    scriptUrl = wslScriptUrl;
  } else if (hostHeader.includes("apt.jfa.dev")) {
    scriptUrl = linuxScriptUrl;
  } else if (hostHeader.includes("win.jfa.dev")) {
    scriptUrl = windowsScriptUrl;
  } else {
    return c.redirect(repoUrl, 302);
  }

  console.log("Script URL:", scriptUrl);

  const response = await fetch(scriptUrl, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "CloudflareWorker",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    return c.text(`Failed to fetch the script (${response.status})`, 500);
  }

  const scriptContent = await response.text();
  const contentType =
    scriptUrl === windowsScriptUrl
      ? "application/x-powershell"
      : "text/x-shellscript";

  console.log("Content-Type:", contentType);

  c.header("Content-Type", contentType);
  c.header("Cache-Control", "no-cache");
  c.header("Access-Control-Allow-Origin", "*");

  return c.body(scriptContent);
});

export default app;