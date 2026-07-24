import fs from "node:fs";

const [optionsPath, outputPath] = process.argv.slice(2);

if (!optionsPath || !outputPath) {
  console.error("usage: node scripts/generate-native-nix-module-options.mjs OPTIONS_JSON OUTPUT_MD");
  process.exit(1);
}

const options = JSON.parse(fs.readFileSync(optionsPath, "utf8"));
const modules = [
  ["awscli", "AWS CLI", "Homebrew formula"],
  ["bat", "Bat", "Nix"],
  ["btop", "Btop", "Nix"],
  ["eza", "Eza", "Nix"],
  ["fastfetch", "Fastfetch", "Nix"],
  ["fd", "fd", "Nix"],
  ["firefox", "Firefox", "Homebrew cask"],
  ["fzf", "fzf", "Nix"],
  ["gh", "GitHub CLI", "Nix"],
  ["ghostty", "Ghostty", "Homebrew cask"],
  ["git", "Git", "Nix"],
  ["go", "Go", "Nix"],
  ["google-chrome", "Google Chrome", "Homebrew cask"],
  ["jq", "jq", "Nix"],
  ["lazygit", "Lazygit", "Homebrew formula"],
  ["neovim", "Neovim", "Homebrew formula"],
  ["ranger", "Ranger", "Homebrew formula"],
  ["ripgrep", "Ripgrep", "Nix"],
  ["starship", "Starship", "Nix"],
  ["t3code", "T3 Code", "Homebrew cask"],
  ["tirith", "Tirith", "Nix"],
  ["twitch-tui", "Twitch TUI", "Nix"],
  ["vim", "Vim", "Nix"],
  ["vscode", "Visual Studio Code", "Homebrew cask"],
  ["zed-editor", "Zed", "Homebrew cask"],
  ["zellij", "Zellij", "Homebrew formula"],
  ["zoxide", "Zoxide", "Nix"],
  ["zsh", "Zsh", "Nix"],
];
const selectedPrefixes = modules.map(([moduleName]) => `programs.${moduleName}.`);
const totalOptions = Object.keys(options).filter((name) =>
  selectedPrefixes.some((prefix) => name.startsWith(prefix)),
).length;

function renderValue(value) {
  if (value === undefined) return "—";
  if (value?._type === "literalExpression" || value?._type === "literalMD") {
    return `\`${String(value.text).replaceAll("`", "\\`").replaceAll("\n", " ")}\``;
  }
  const rendered = JSON.stringify(value);
  return rendered === undefined
    ? "—"
    : `\`${rendered.replaceAll("`", "\\`").replaceAll("\n", " ")}\``;
}

function cleanDescription(description = "") {
  return description
    .replaceAll("\n", " ")
    .replace(/\s+/g, " ")
    .replaceAll("|", "\\|")
    .trim() || "—";
}

const generated = new Date().toISOString().slice(0, 10);
const lines = [
  "# Native Nix configuration knobs for installed macOS software",
  "",
  `Generated ${generated} from the Home Manager 26.05 option schema pinned in \`packages/aarch64-darwin/flake.nix\`.`,
  "",
  `This covers all ${totalOptions} Nix options across the 28 installed applications and tools that have native Home Manager \`programs.*\` modules. An option such as \`settings\` may be a free-form attribute set; in that case Home Manager exposes one Nix knob and the nested keys are defined by the application itself.`,
  "",
  "Enabling a module can install its Nix package. For software intentionally installed by Homebrew, inspect the module's `package` option before enabling it; use `package = null` only when its documented type permits `null`.",
  "",
  "## Index",
  "",
  "| Module | Application | Current installer | Knobs |",
  "|---|---|---|---:|",
];

for (const [moduleName, displayName, installer] of modules) {
  const prefix = `programs.${moduleName}.`;
  const count = Object.keys(options).filter((name) => name.startsWith(prefix)).length;
  lines.push(`| [\`programs.${moduleName}\`](#programs${moduleName.replaceAll("-", "")}) | ${displayName} | ${installer} | ${count} |`);
}

for (const [moduleName, displayName, installer] of modules) {
  const prefix = `programs.${moduleName}.`;
  const entries = Object.entries(options)
    .filter(([name]) => name.startsWith(prefix))
    .sort(([left], [right]) => left.localeCompare(right));

  lines.push(
    "",
    `## \`programs.${moduleName}\``,
    "",
    `${displayName} — currently installed through ${installer}.`,
    "",
    "| Option | Type | Default | Description |",
    "|---|---|---|---|",
  );

  for (const [name, metadata] of entries) {
    lines.push(
      `| \`${name}\` | ${cleanDescription(metadata.type)} | ${renderValue(metadata.default)} | ${cleanDescription(metadata.description)} |`,
    );
  }
}

lines.push(
  "",
  "## Regenerating this reference",
  "",
  "Build the pinned Home Manager JSON documentation and pass its `options.json` file to the generator:",
  "",
  "```sh",
  "cd packages/aarch64-darwin",
  "options_root=$(nix build --impure --no-link --print-out-paths --expr '(builtins.getFlake (toString ./.)).inputs.home-manager.packages.aarch64-darwin.docs-json')",
  "cd ../..",
  "node scripts/generate-native-nix-module-options.mjs \\",
  '  "$options_root/share/doc/home-manager/options.json" \\',
  "  documentation/native-nix-module-options.md",
  "```",
  "",
);

fs.writeFileSync(outputPath, `${lines.join("\n")}\n`);
