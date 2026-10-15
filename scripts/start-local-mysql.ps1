param([switch]$Stop, [switch]$Check)
$ErrorActionPreference = 'Stop'
& (Join-Path (Split-Path -Parent $PSScriptRoot) 'start.ps1') -DatabaseOnly -Check:$Check -StopDatabase:$Stop
