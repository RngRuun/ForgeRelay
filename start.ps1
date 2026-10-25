param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$relayRoot = $PSScriptRoot
$relayUrl = 'http://127.0.0.1:4317'
$relayHealthy = $false
try {
  $relayHealth = Invoke-RestMethod -Uri "$relayUrl/api/health" -TimeoutSec 2
  if ($relayHealth.app -eq 'relay-workbench') { $relayHealthy = $true }
  else { throw 'Port 4317 is being used by another application.' }
} catch { }
if (-not $relayHealthy) {
  $relayNode = (Get-Command node -ErrorAction Stop).Source
  $relayData = Join-Path $relayRoot 'data'
  New-Item -ItemType Directory -Force -Path $relayData | Out-Null
  $relayServerPath = Join-Path $relayRoot 'server.mjs'
  $relayProcess = Start-Process -FilePath $relayNode -ArgumentList @(('"' + $relayServerPath + '"')) -WorkingDirectory $relayRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $relayData 'server.log') -RedirectStandardError (Join-Path $relayData 'server-error.log') -PassThru
  $relayProcess.Id | Set-Content -LiteralPath (Join-Path $relayData 'relay.pid')
  for ($relayAttempt = 0; $relayAttempt -lt 30; $relayAttempt++) {
    Start-Sleep -Milliseconds 250
    try { $relayHealth = Invoke-RestMethod -Uri "$relayUrl/api/health" -TimeoutSec 1; if ($relayHealth.app -eq 'relay-workbench') { $relayHealthy = $true; break } } catch { }
    if ($relayProcess.HasExited) { break }
  }
}
if (-not $relayHealthy) { throw 'Relay could not start. Check data/server-error.log and make sure port 4317 is available.' }
Write-Output "Relay is ready: $relayUrl"
if (-not $NoBrowser) { Start-Process $relayUrl }
