param([switch]$Check, [switch]$DatabaseOnly, [switch]$StopDatabase)
$ErrorActionPreference = 'Stop'
$clinicWorkspace = $PSScriptRoot
$clinicExe = Join-Path $clinicWorkspace '.local\mysql-8.4.11-winx64\bin\mysqld.exe'
$clinicIni = Join-Path $clinicWorkspace '.local\mysql.ini'
$clinicLogHelper = Join-Path $(if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }) 'harness\Write-PortEvent.ps1'

function Write-ClinicPortEvent([string]$Event, [string]$Service, [int]$Port) {
    if (Test-Path -LiteralPath $clinicLogHelper) {
        & $clinicLogHelper -Event $Event -Owner 'clinic' -Service $Service -Port $Port -ProjectPath $clinicWorkspace -Detail 'Project startup; credentials omitted.'
    }
}

function Get-ClinicListener([int]$Port) {
    @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}
function Assert-ClinicDatabaseOwner {
    $listeners = @(Get-ClinicListener 3310)
    if (-not $listeners.Count) { return $false }
    foreach ($listener in $listeners) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
        if (-not $process -or $process.ExecutablePath -ne $clinicExe -or
            $process.CommandLine -notlike ('*--defaults-file=*' + $clinicIni + '*')) {
            throw "Port 3310 belongs to another process (PID $($listener.OwningProcess)). No process was stopped."
        }
    }
    return $true
}

Push-Location -LiteralPath $clinicWorkspace
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'Install Node.js 22.12+ and npm first.'
    }
    if (-not (Test-Path -LiteralPath '.env') -or -not (Test-Path -LiteralPath 'node_modules/mysql2')) {
        throw 'Configure .env and run npm ci first. See README.md.'
    }
    & node scripts/check-local-config.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Local configuration check failed.' }
    if (-not $DatabaseOnly -or $StopDatabase) {
        foreach ($port in @(3100, 3101)) {
            $listeners = @(Get-ClinicListener $port)
            if ($listeners.Count) {
                throw "Port $port is already occupied (PID $($listeners[0].OwningProcess)). Stop its owning app first; ports never change automatically."
            }
        }
    }
    $databaseRunning = Assert-ClinicDatabaseOwner
    if ($StopDatabase) {
        if (-not $databaseRunning) {
            Write-Output 'Clinic MySQL is already stopped.'
            return
        }
        if ($Check) {
            & node scripts/check-local-config.mjs --database-ready
            if ($LASTEXITCODE -ne 0) { throw 'Clinic database identity check failed. No shutdown requested.' }
            Write-Output 'Clinic database shutdown check passed. No services stopped.'
            return
        }
        Write-ClinicPortEvent 'stop_requested' 'mysql' 3310
        & node scripts/check-local-config.mjs --database-stop
        if ($LASTEXITCODE -ne 0) { throw 'Guarded Clinic MySQL shutdown failed. No process was killed.' }
        Write-ClinicPortEvent 'shutdown_requested' 'mysql' 3310
        Write-Output 'Verified Clinic MySQL graceful shutdown requested.'
        return
    }
    if (-not $databaseRunning) {
        if (-not (Test-Path -LiteralPath $clinicExe) -or -not (Test-Path -LiteralPath $clinicIni)) {
            throw 'Portable MySQL is missing. Configure the documented local installation before starting.'
        }
        $iniText = Get-Content -LiteralPath $clinicIni -Raw
        if ($iniText -notmatch '(?m)^\s*port\s*=\s*3310\s*$' -or $iniText -notmatch '(?m)^\s*bind-address\s*=\s*127\.0\.0\.1\s*$') {
            throw 'Portable mysql.ini must use port=3310 and bind-address=127.0.0.1. Preserve its existing data directory.'
        }
        $existing = @(Get-CimInstance Win32_Process -Filter "Name='mysqld.exe'" | Where-Object { $_.ExecutablePath -eq $clinicExe })
        if ($existing.Count) { throw 'Clinic MySQL already runs on another port or is starting. Check its configuration; no duplicate instance was started.' }
    }
    if ($Check) {
        Write-Output 'Clinic check passed: web 3100, API 3101, MySQL 3310. No services started.'
        return
    }
    if (-not $databaseRunning) {
        Write-ClinicPortEvent 'start_requested' 'mysql' 3310
        Start-Process -FilePath $clinicExe -ArgumentList @('--defaults-file="' + $clinicIni + '"') -WindowStyle Hidden
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        $databaseRunning = Assert-ClinicDatabaseOwner
        if ($databaseRunning) {
            & node scripts/check-local-config.mjs --database-ready 2>$null
            if ($LASTEXITCODE -eq 0) { break }
        }
        if ([DateTime]::UtcNow -ge $deadline) { throw 'Clinic MySQL did not become ready within 45 seconds. Inspect its error log; no process was killed.' }
        Start-Sleep -Milliseconds 500
    } while ($true)
    Write-ClinicPortEvent 'ready' 'mysql' 3310
    Write-Output 'Clinic MySQL ready on 3310. Application: http://127.0.0.1:3100'
    if (-not $DatabaseOnly) {
        Write-ClinicPortEvent 'start_requested' 'api' 3101
        Write-ClinicPortEvent 'start_requested' 'web' 3100
        try {
            & npm.cmd run dev
            if ($LASTEXITCODE -ne 0) { throw "Clinic development server exited with code $LASTEXITCODE." }
        } finally {
            Write-ClinicPortEvent 'command_exited' 'api' 3101
            Write-ClinicPortEvent 'command_exited' 'web' 3100
        }
    }
} finally { Pop-Location }
