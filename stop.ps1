$ErrorActionPreference = 'Stop'
$relayPidFile = Join-Path $PSScriptRoot 'data\relay.pid'
if (-not (Test-Path -LiteralPath $relayPidFile)) { Write-Output 'Relay is not running from this launcher.'; exit }
$relayProcessId = [int](Get-Content -LiteralPath $relayPidFile)
$relayProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $relayProcessId"
$relayServerPath = Join-Path $PSScriptRoot 'server.mjs'
if ($relayProcess -and $relayProcess.CommandLine.Contains($relayServerPath)) {
  try {
    $relaySession = Invoke-RestMethod -Uri 'http://127.0.0.1:4317/api/state' -TimeoutSec 2
    Invoke-RestMethod -Uri 'http://127.0.0.1:4317/api/shutdown' -Method Post -Headers @{'X-Relay-Token' = $relaySession.token} -ContentType 'application/json' -Body '{}' -TimeoutSec 3 | Out-Null
    for ($relayAttempt = 0; $relayAttempt -lt 60; $relayAttempt++) {
      Start-Sleep -Milliseconds 100
      if (-not (Get-Process -Id $relayProcessId -ErrorAction SilentlyContinue)) { Write-Output 'Relay stopped.'; exit }
    }
  } catch { }
  Stop-Process -Id $relayProcessId -ErrorAction SilentlyContinue
  Write-Output 'Relay stopped.'
}
else { Write-Output 'No matching Relay process found.' }
