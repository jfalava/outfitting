export function generateProfileErrorScript(host: string, invalidProfiles: string[]): string {
  return `# Error: Invalid profile(s) specified
#
# Invalid profiles: ${invalidProfiles.join(", ")}
# Profile names must start with a letter or number and contain only letters, numbers, dots, dashes, or underscores.
# Retired msstore-* profiles and the old msstore/packages route names are not accepted. Select a regular profile instead.
#
# Usage examples:
#   irm ${host}/base | iex
#   irm ${host}/dev+gaming | iex

Write-Host ""
Write-Host "Error: Invalid profile(s) specified" -ForegroundColor Red
Write-Host "  Invalid: ${invalidProfiles.join(", ")}" -ForegroundColor Yellow
Write-Host ""
Write-Host "Profile names must start with a letter or number and contain only letters, numbers, dots, dashes, or underscores." -ForegroundColor Cyan
Write-Host "Retired msstore-* profiles are not accepted. Select a regular profile such as base." -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
exit 1
`;
}
