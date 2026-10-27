param([switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw 'Node.js 22.19+ is required to run from source. The Windows portable app includes its runtime.'
}
$relayArguments = @((Join-Path $PSScriptRoot 'tools/start-desktop.mjs'))
if ($PrepareOnly) { $relayArguments += '--prepare-only' }
& node.exe @relayArguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
