import { Hono } from "hono";

const app = new Hono();

app.get("*", async (c) => {
  const host = c.req.header("Host") || "";
  const { pathname } = new URL(c.req.url);

  const allowedHosts = ["wsl.jfa.dev", "win.jfa.dev"];
  const isAllowedHost = allowedHosts.some((allowedHost) =>
    host.includes(allowedHost),
  );

  if (
    isAllowedHost &&
    ((host.includes("wsl.jfa.dev") && pathname === "/") ||
      (host.includes("win.jfa.dev") &&
        (pathname === "/" || pathname === "/post-install")))
  ) {
    const wslScriptUrl =
      "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/wsl-install-script.sh";
    const windowsScriptUrl =
      "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/windows-install-script.ps1";

    const windowsPostInstallScriptUrl =
      "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/windows-post-install-script.ps1";

    let scriptUrl: string;
    if (host.includes("wsl.jfa.dev")) {
      scriptUrl = wslScriptUrl;
    } else if (pathname === "/post-install") {
      scriptUrl = windowsPostInstallScriptUrl;
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
      scriptUrl === wslScriptUrl
        ? "text/x-shellscript"
        : "application/x-powershell";

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
