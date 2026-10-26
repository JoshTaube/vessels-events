<#
  deploy.ps1 - build and publish the Vessels Events site (vessels-events.netlify.app).

  This is NOT playvessels.com. It is the private event site, backed by the Vessels Events Supabase project, and it
  refuses to upload anything that still mentions the production project (Vessels Live's rule, kept).

  USAGE (from the Vessels Events folder)
    powershell -ExecutionPolicy Bypass -File web\deploy.ps1 -Show shows\sample-show\show.json          publish
    powershell -ExecutionPolicy Bypass -File web\deploy.ps1 -Show shows\sample-show\show.json -Draft   preview URL only
#>
param(
  [Parameter(Mandatory = $true)][string]$Show,
  [switch]$Draft
)
$ErrorActionPreference = 'Stop'
$env:PATH = 'C:\Users\Josh\AppData\Roaming\npm;' + $env:PATH
$root = Split-Path -Parent $PSScriptRoot
$site = Join-Path $root 'web\_site'
$fns = Join-Path $root 'web\_functions'
$cfg = Get-Content (Join-Path $root 'config\event.local.json') -Raw | ConvertFrom-Json

Push-Location $root
try {
  node web\build-event.js --show $Show
  if ($LASTEXITCODE -ne 0) { throw 'build failed' }
} finally { Pop-Location }

# Independent sweep: a stale build can't be uploaded by accident.
$leaks = Get-ChildItem $site, $fns -Recurse -Include *.html, *.js, *.mjs, *.css, *.json |
  Where-Object { (Get-Content $_.FullName -Raw) -match [regex]::Escape($cfg.prodRef) }
if ($leaks) { $leaks | ForEach-Object { Write-Host ('  points at production: ' + $_.Name) -ForegroundColor Red }; throw 'REFUSING TO DEPLOY' }
Write-Host '  verified: nothing mentions the production project.' -ForegroundColor Green

$args = @('deploy', '--no-build', '--dir', $site, '--functions', $fns, '--site', $cfg.netlifySiteId)
if (-not $Draft) { $args += '--prod' }
Push-Location 'F:\'
try { & netlify.cmd @args } finally { Pop-Location }
