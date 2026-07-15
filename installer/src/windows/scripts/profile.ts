export function generateProfileErrorScript(
  host: string,
  invalidProfiles: string[],
  availableProfiles: readonly string[],
): string {
  return `# Error: Invalid profile(s) specified
#
# Invalid profiles: ${invalidProfiles.join(", ")}
# Available profiles: ${availableProfiles.join(", ")}
#
# Usage examples:
#   irm ${host}/base | iex
#   irm ${host}/dev+gaming | iex

Write-Host ""
Write-Host "Error: Invalid profile(s) specified" -ForegroundColor Red
Write-Host "  Invalid: ${invalidProfiles.join(", ")}" -ForegroundColor Yellow
Write-Host ""
Write-Host "Available profiles:" -ForegroundColor Cyan
Write-Host "  ${availableProfiles.join(", ")}" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
exit 1
`;
}
