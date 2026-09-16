export function generateMsstoreErrorScript(host: string, invalidProfiles: string[]): string {
  return `# Error: Invalid Microsoft Store profile(s) specified
#
# Invalid profiles: ${invalidProfiles.join(", ")}
# Microsoft Store profile names must start with msstore- and contain only letters, numbers, dots, dashes, or underscores.
#
# Usage examples:
#   irm ${host}/msstore/msstore-base | iex
#   irm ${host}/msstore/msstore-base+msstore-gaming | iex

Write-Host ""
Write-Host "Error: Invalid Microsoft Store profile(s) specified" -ForegroundColor Red
Write-Host "  Invalid: ${invalidProfiles.join(", ")}" -ForegroundColor Yellow
Write-Host ""
Write-Host "Microsoft Store profile names must start with msstore- and contain only letters, numbers, dots, dashes, or underscores." -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
exit 1
`;
}
