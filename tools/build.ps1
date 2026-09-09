# Build and verify zotero-neo.xpi on Windows (PowerShell 5.1+).
# Usage: powershell -ExecutionPolicy Bypass -File tools\build.ps1
param(
    [string]$Root = ($PSScriptRoot | Split-Path -Parent)
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path -LiteralPath $Root).Path

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or
    -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "Node.js 24 and npm are required"
}
if (-not (Test-Path -LiteralPath (Join-Path $Root "node_modules"))) {
    throw "Dependencies are missing; run 'npm ci' first"
}

Push-Location $Root
try {
    & npm run verify
    if ($LASTEXITCODE -ne 0) {
        throw "Zotero Neo verification failed"
    }
} finally {
    Pop-Location
}

Write-Host "Done: zotero-neo.xpi"
