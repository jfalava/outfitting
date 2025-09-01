import { Hono } from "hono";

const app = new Hono();

app.get("*", async (c) => {
  const host = c.req.header("Host") || "";
  const { pathname } = new URL(c.req.url);

  const allowedHosts = ["wsl.jfa.dev", "apt.jfa.dev", "win.jfa.dev"];
  const isAllowedHost = allowedHosts.some((allowedHost) =>
    host.includes(allowedHost)
  );

  if (isAllowedHost && pathname === "/") {
    const wslScriptUrl =
      "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/wsl-install-script.sh";
    const windowsScriptUrl =
      "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/windows-install-script.ps1";
    const linuxScriptUrl =
      "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/apt-desktop-install-script.sh";

    let scriptUrl: string;
    if (host.includes("wsl.jfa.dev")) {
      scriptUrl = wslScriptUrl;
    } else if (host.includes("apt.jfa.dev")) {
      scriptUrl = linuxScriptUrl;
    } else {
      scriptUrl = windowsScriptUrl;
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
  } else {
    return c.text("I'm a teapot", 418);
  }
});

export default app;
