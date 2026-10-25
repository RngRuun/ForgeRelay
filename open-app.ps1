$ErrorActionPreference = 'Stop'
$relayDistribution = Join-Path (Split-Path $PSScriptRoot -Parent) 'ForgeRelay-App'
$relayExecutable = Join-Path $relayDistribution 'win-unpacked/ForgeRelay.exe'
if (-not (Test-Path -LiteralPath $relayExecutable)) {
  $relayPortable = Get-ChildItem -LiteralPath $relayDistribution -Filter 'ForgeRelay-*-Windows-x64.exe' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($relayPortable) { $relayExecutable = $relayPortable.FullName }
  else { throw 'Desktop build is missing. Run npm install and npm run dist in desktop/, or download the complete Windows application.' }
}
Start-Process -FilePath $relayExecutable -WorkingDirectory (Split-Path $relayExecutable -Parent)
Write-Output 'ForgeRelay desktop application opened.'
