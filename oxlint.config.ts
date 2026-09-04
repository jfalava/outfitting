import { defineConfig, type DummyRuleMap } from "oxlint";

// Oxlint rejects relative jsPlugins specifiers inside configs consumed via
// `extends`, so the base exposes a factory and each workspace registers the
// plugin itself with a path prefix relative to its own directory
// (".." for workspace roots, "../.." if nested).
export const antiSlopJsPlugins = (specifierPrefix: string) => [
  {
    name: "anti-slop",
    specifier: `${specifierPrefix}/tools/oxlint/anti-slop/index.ts`,
  },
];

// Agent-tool directories can appear anywhere; never lint them as source.
// Patterns resolve relative to each consuming config's directory.
export const agentIgnores = [
  ".agent/**",
  ".agents/**",
  ".claude/**",
  ".codex/**",
  ".continue/**",
  ".cursor/**",
  ".gemini/**",
  ".opencode/**",
  ".pi/**",
  ".roo/**",
  ".windsurf/**",
];

export const antiSlopRules: DummyRuleMap = {
  "anti-slop/no-chained-type-assertions": "error",
  "anti-slop/no-conditional-empty-object-spread": "error",
  "anti-slop/no-known-value-widening": "error",
  "anti-slop/no-object-parameters": "error",
  "anti-slop/no-runtime-typeof": "error",
  "anti-slop/no-shape-in-symbol-names": "error",
  "anti-slop/no-unknown-parameters": "error",
  "anti-slop/no-unknown-type-aliases": "error",
  "anti-slop/no-unsafe-dictionary-type": "error",
  "anti-slop/no-widen-then-assert": "error",
};

const builtinRules: DummyRuleMap = {
  "typescript/no-explicit-any": "error",
  "typescript/no-unsafe-assignment": "error",
  "typescript/no-unsafe-call": "error",
  "typescript/no-unsafe-member-access": "error",
  "typescript/no-unsafe-return": "error",
  "typescript/no-implied-eval": "error",
  "typescript/no-unsafe-type-assertion": "off",
  "typescript/no-unnecessary-type-assertion": "off",
  "no-unused-vars": [
    "error",
    {
      vars: "all",
      args: "after-used",
      caughtErrors: "all",
      ignoreRestSiblings: false,
      varsIgnorePattern: "^_",
      argsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
  "no-undef": "error",
  "no-unreachable": "error",
  "no-dupe-keys": "error",
  "no-dupe-class-members": "error",
  "no-fallthrough": "error",
  "no-duplicate-imports": "error",
  "no-eval": "error",
  "no-debugger": "error",
  "no-console": [
    "error",
    {
      allow: ["warn", "error"],
    },
  ],
  "no-with": "error",
  "no-proto": "error",
  "no-new-wrappers": "error",
  "no-iterator": "error",
  "no-labels": "error",
  "no-var": "error",
  "no-param-reassign": "error",
  "no-extend-native": "error",
  "no-func-assign": "error",
  "no-empty-function": "error",
  "no-extra-bind": "error",
  "no-useless-constructor": "error",
  "no-unused-expressions": "error",
  eqeqeq: [
    "error",
    "always",
    {
      null: "ignore",
    },
  ],
  curly: ["error", "all"],
  "no-implicit-coercion": [
    "error",
    {
      boolean: true,
      number: true,
      string: true,
      disallowTemplateShorthand: true,
    },
  ],
  "prefer-const": [
    "error",
    {
      destructuring: "all",
    },
  ],
  complexity: ["error", 12],
  "max-depth": ["error", 4],
  "max-params": ["error", 4],
  "max-statements": ["error", 20],
  "import/no-duplicates": "error",
  "import/no-mutable-exports": "error",
  "import/no-cycle": "error",
  "import/no-self-import": "error",
};

// Strict application base: type-aware linting over the built-in plugins plus
// the vendored anti-slop rules. Workspace configs spread this and add their
// own jsPlugins registration and ignorePatterns.
export default defineConfig({
  options: {
    typeAware: true,
    typeCheck: true,
  },
  plugins: ["eslint", "react", "typescript", "unicorn", "oxc", "import", "promise"],
  categories: {
    correctness: "error",
    suspicious: "warn",
  },
  env: {
    node: true,
    browser: false,
    es2022: true,
  },
  rules: {
    ...builtinRules,
    ...antiSlopRules,
  },
  ignorePatterns: ["tools/**"],
});
