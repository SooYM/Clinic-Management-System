param([switch]$Stop)
$ErrorActionPreference = 'Stop'
$clinicWorkspace = Split-Path -Parent $PSScriptRoot
$clinicIni = Join-Path $clinicWorkspace '.local\mysql.ini'
$clinicExe = Join-Path $clinicWorkspace '.local\mysql-8.4.11-winx64\bin\mysqld.exe'
if (-not (Test-Path -LiteralPath $clinicIni) -or -not (Test-Path -LiteralPath $clinicExe)) { throw 'Local MySQL files missing. Configure an existing MySQL server using .env instead.' }
if ($Stop) {
    Push-Location -LiteralPath $clinicWorkspace
    try {
        node --input-type=module -e "import 'dotenv/config'; import mysql from 'mysql2/promise'; const url=new URL(process.env.DATABASE_URL); if(url.hostname!=='127.0.0.1'||url.port!=='33079')throw new Error('Refusing shutdown outside isolated clinic database.'); const db=await mysql.createConnection(url.href); await db.query('SHUTDOWN'); await db.end();"
        if ($LASTEXITCODE -ne 0) { throw 'Graceful local MySQL shutdown failed.' }
        Write-Output 'Local clinic MySQL shutdown requested.'
    } finally { Pop-Location }
} else {
    $clinicRunning = Get-CimInstance Win32_Process -Filter "Name='mysqld.exe'" | Where-Object { $_.ExecutablePath -eq $clinicExe }
    if (-not $clinicRunning) { Start-Process -FilePath $clinicExe -ArgumentList @('--defaults-file="' + $clinicIni + '"') -WindowStyle Hidden }
    Write-Output 'Local clinic MySQL uses loopback port 33079.'
}
