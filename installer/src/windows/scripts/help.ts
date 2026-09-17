export function generateHelpScript(host: string): string {
  return `# Outfitting - Windows CLI Bootstrap
#
# Usage: irm ${host}/<profile> | iex
#
# The bootstrap downloads the release outfitting-manager binary. The manager
# fetches selected manifests and the PowerShell profile sparsely from GitHub;
# it does not clone the monorepo.
#
# WinGet Package Profiles (including Microsoft Store packages):
#   base     - Core packages, runtimes, utilities, and Store apps
#   dev      - Development tools and environments
#   gaming   - Gaming platforms and tools
#   work     - Work-related applications
#   qol      - Quality of life improvements
#   network  - Network tools and utilities
#
# Additional Installations:
#   registry - Install Windows registry tweaks only
#
# Examples:
#   irm ${host}/base | iex                              # Install base + Store packages
#   irm ${host}/dev+gaming | iex                        # Install dev + gaming packages
#   irm ${host}/registry | iex                          # Install registry tweaks only
#
# Note: Packages must be explicitly specified. There is no default installation.

Write-Host ""
Write-Host "❖❖❖ Outfitting - Windows CLI Bootstrap ❖❖❖" -ForegroundColor Cyan
Write-Host ""
Write-Host "WinGet Package Profiles (including Microsoft Store packages):" -ForegroundColor Yellow
Write-Host "  • base     - Core packages, runtimes, utilities, and Store apps" -ForegroundColor White
Write-Host "  • dev      - Development tools and environments" -ForegroundColor White
Write-Host "  • gaming   - Gaming platforms and tools" -ForegroundColor White
Write-Host "  • work     - Work-related applications" -ForegroundColor White
Write-Host "  • qol      - Quality of life improvements" -ForegroundColor White
Write-Host "  • network  - Network tools and utilities" -ForegroundColor White
Write-Host ""
Write-Host "Additional Installations:" -ForegroundColor Yellow
Write-Host "  • registry - Install Windows registry tweaks only" -ForegroundColor White
Write-Host ""
Write-Host "Usage Examples:" -ForegroundColor Yellow
Write-Host "  WinGet packages:" -ForegroundColor Cyan
Write-Host "    irm ${host}/base | iex" -ForegroundColor Green
Write-Host "    irm ${host}/dev+gaming+qol | iex" -ForegroundColor Green
Write-Host ""
Write-Host "  Registry tweaks only:" -ForegroundColor Cyan
Write-Host "    irm ${host}/registry | iex" -ForegroundColor Green
Write-Host ""
Write-Host "Tip: Combine multiple profiles with '+' to customize your installation" -ForegroundColor Cyan
Write-Host "The manager owns package installation and records windows.lock.json." -ForegroundColor DarkGray
Write-Host ""
`;
}
