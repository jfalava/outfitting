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
      name: "WSL",
      url: "/docs/wsl",
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
    {
      type: "folder",
      name: "Manager",
      children: [
        {
          type: "page",
          name: "Overview",
          url: "/docs/manager",
        },
        {
          type: "page",
          name: "CLI",
          url: "/docs/manager/cli",
        },
        {
          type: "page",
          name: "Lockfiles Worker",
          url: "/docs/manager/lockfiles-worker",
        },
      ],
    },
  ],
};
