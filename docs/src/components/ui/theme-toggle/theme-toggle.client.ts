/**
 * theme-toggle.client.ts — light/dark toggle. Writes pref to localStorage
 * ("ui-mode"); BaseLayout's pre-paint script owns DOM application so view
 * transitions, OS changes, and cross-tab edits stay in sync.
 */

import { mount } from "@cloudflare/nimbus-docs/client";

declare global {
  interface Window {
    nbApplyTheme?: () => void;
  }
}

function handleThemeClick() {
  const isDark = document.documentElement.getAttribute("data-mode") === "dark";
  try {
    localStorage.setItem("ui-mode", isDark ? "light" : "dark");
  } catch {
    // Ignore storage errors (private mode / restricted contexts).
  }
  window.nbApplyTheme?.();
}

function initThemeToggle(button: HTMLElement): () => void {
  window.nbApplyTheme?.();
  button.addEventListener("click", handleThemeClick);
  return () => button.removeEventListener("click", handleThemeClick);
}

mount("[data-nb-theme-toggle]", initThemeToggle);
