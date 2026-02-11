import type { Root } from "fumadocs-core/page-tree";

export const docsTree: Root = {
  name: "Documentation",
  children: [
    {
      type: "page",
      name: "Overview",
      url: "/docs",
    },
    {
      type: "page",
      name: "Installer Guide",
      url: "/docs/installer-guide",
    },
    {
      type: "page",
      name: "Windows",
      url: "/docs/windows",
    },
    {
      type: "page",
      name: "WSL/Linux",
      url: "/docs/wsl-linux",
    },
    {
      type: "page",
      name: "macOS",
      url: "/docs/macos",
    },
    {
      type: "page",
      name: "Repository Configuration",
      url: "/docs/repository-configuration",
    },
    {
      type: "page",
      name: "Updates",
      url: "/docs/updates",
    },
  ],
};
