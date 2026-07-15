export function generateHelpScript(host: string): string {
  return `# Outfitting - Windows Package Installer
#
# Usage: irm ${host}/<profile> | iex
#
# WinGet Package Profiles:
#   base     - Core packages, runtimes, and utilities
#   dev      - Development tools and environments
#   gaming   - Gaming platforms and tools
#   work     - Work-related applications
#   qol      - Quality of life improvements
#   network  - Network tools and utilities
#
# Microsoft Store Package Profiles:
#   msstore-base    - Core Microsoft Store apps
#   msstore-dev     - Development-related Store apps
#   msstore-gaming  - Gaming-related Store apps
#   msstore-work    - Work-related Store apps
#   msstore-qol     - Quality of life Store apps
#
# Additional Installations:
#   bun      - Install Bun global packages (requires Bun to be installed)
#   registry - Install Windows registry tweaks only
#
# Examples:
#   irm ${host}/base | iex                              # Install WinGet base packages
#   irm ${host}/dev+gaming | iex                        # Install dev + gaming packages
#   irm ${host}/msstore/msstore-base | iex              # Install Microsoft Store base apps
#   irm ${host}/msstore/msstore-base+msstore-qol | iex  # Install Store base + qol apps
#   irm ${host}/bun | iex                               # Install Bun global packages
#   irm ${host}/registry | iex                          # Install registry tweaks only
#
# Note: Packages must be explicitly specified. There is no default installation.

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    Outfitting - Windows Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "WinGet Package Profiles:" -ForegroundColor Yellow
Write-Host "  • base     - Core packages, runtimes, and utilities" -ForegroundColor White
Write-Host "  • dev      - Development tools and environments" -ForegroundColor White
Write-Host "  • gaming   - Gaming platforms and tools" -ForegroundColor White
Write-Host "  • work     - Work-related applications" -ForegroundColor White
Write-Host "  • qol      - Quality of life improvements" -ForegroundColor White
Write-Host "  • network  - Network tools and utilities" -ForegroundColor White
Write-Host ""
Write-Host "Microsoft Store Package Profiles:" -ForegroundColor Yellow
Write-Host "  • msstore-base    - Core Microsoft Store apps" -ForegroundColor White
Write-Host "  • msstore-dev     - Development-related Store apps" -ForegroundColor White
Write-Host "  • msstore-gaming  - Gaming-related Store apps" -ForegroundColor White
Write-Host "  • msstore-work    - Work-related Store apps" -ForegroundColor White
Write-Host "  • msstore-qol     - Quality of life Store apps" -ForegroundColor White
Write-Host ""
Write-Host "Additional Installations:" -ForegroundColor Yellow
Write-Host "  • bun      - Install Bun global packages (requires Bun installed)" -ForegroundColor White
Write-Host "  • registry - Install Windows registry tweaks only" -ForegroundColor White
Write-Host ""
Write-Host "Usage Examples:" -ForegroundColor Yellow
Write-Host "  WinGet packages:" -ForegroundColor Cyan
Write-Host "    irm ${host}/base | iex" -ForegroundColor Green
Write-Host "    irm ${host}/dev+gaming+qol | iex" -ForegroundColor Green
Write-Host ""
Write-Host "  Microsoft Store packages:" -ForegroundColor Cyan
Write-Host "    irm ${host}/msstore/msstore-base | iex" -ForegroundColor Green
Write-Host "    irm ${host}/msstore/msstore-base+msstore-gaming | iex" -ForegroundColor Green
Write-Host ""
Write-Host "  Bun global packages:" -ForegroundColor Cyan
Write-Host "    irm ${host}/bun | iex" -ForegroundColor Green
Write-Host ""
Write-Host "  Registry tweaks only:" -ForegroundColor Cyan
Write-Host "    irm ${host}/registry | iex" -ForegroundColor Green
Write-Host ""
Write-Host "Tip: Combine multiple profiles with '+' to customize your installation" -ForegroundColor Cyan
Write-Host ""
`;
}
