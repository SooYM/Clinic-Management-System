param([switch]$Check, [switch]$FunctionsOnly)
$ErrorActionPreference = 'Stop'
$clinicRoot = Split-Path -Parent $PSScriptRoot

function Test-ClinicDevProcess($Process, [string]$Root) {
    if (-not $Process -or $Process.Name -notin @('node.exe', 'powershell.exe')) { return $false }
    $command = [Uri]::UnescapeDataString([string]$Process.CommandLine).Replace('/', '\')
    if ($Process.Name -eq 'powershell.exe') {
        return $command.Contains((Join-Path $Root 'start.ps1')) -and $command -match '(?i)\s-File\s'
    }
    return $command.Contains((Join-Path $Root 'node_modules\')) -and
        $command -match '(?i)(concurrently[\\/].*concurrently\.js|tsx[\\/].*(cli\.mjs|loader\.mjs)|vite[\\/]bin[\\/]vite\.js)'
}

function Get-ClinicStopPlan($Processes, $Listeners, [string]$Root) {
    $byId = @{}
    foreach ($process in $Processes) { $byId[[int]$process.ProcessId] = $process }
    foreach ($listener in $Listeners) {
        if (-not (Test-ClinicDevProcess $byId[[int]$listener.OwningProcess] $Root)) {
            throw "Port $($listener.LocalPort) belongs to an unverified process (PID $($listener.OwningProcess)). No processes stopped; no fallback port allowed."
        }
    }
    $roots = @($Processes | Where-Object { Test-ClinicDevProcess $_ $Root })
    $selected = @{}
    foreach ($process in $roots) {
        $selected[[int]$process.ProcessId] = $process
        # End the previous launch wrapper too, releasing its foreground lifetime mutex.
        if ($process.Name -eq 'powershell.exe') {
            $parent = $byId[[int]$process.ParentProcessId]
            if ($parent -and $parent.Name -eq 'powershell.exe' -and
                $parent.CommandLine -match '[\\/]harness[\\/]webapp\.ps1"?\s+clinic(?:\s+management)?\s*$') {
                $selected[[int]$parent.ProcessId] = $parent
            }
        }
    }
    do {
        $added = $false
        foreach ($process in $Processes) {
            if ($process.Name -ne 'mysqld.exe' -and
                $selected.ContainsKey([int]$process.ParentProcessId) -and
                -not $selected.ContainsKey([int]$process.ProcessId)) {
                $selected[[int]$process.ProcessId] = $process
                $added = $true
            }
        }
    } while ($added)
    # Parents first: watchers must stop before their children to prevent respawning.
    $remaining = @($selected.Values)
    while ($remaining.Count) {
        $level = @($remaining | Where-Object { -not $selected.ContainsKey([int]$_.ParentProcessId) })
        if (-not $level.Count) { throw 'Unexpected Clinic process ancestry cycle. No processes stopped.' }
        foreach ($process in $level) { $process; $selected.Remove([int]$process.ProcessId) }
        $remaining = @($selected.Values)
    }
}

if ($FunctionsOnly) { return }
$processes = @(Get-CimInstance Win32_Process)
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(3100, 3101) })
$plan = @(Get-ClinicStopPlan $processes $listeners $clinicRoot)
if ($Check) {
    Write-Output "Clinic restart check passed: $($plan.Count) verified web/API workers; MySQL preserved. No processes stopped."
    return
}
$logger = Join-Path $HOME '.codex\harness\Write-PortEvent.ps1'
foreach ($process in $plan) {
    if ([int]$process.ProcessId -eq $PID) { throw 'Refusing to stop the current launcher.' }
    $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ProcessId)"
    if (-not $current) { continue }
    if ($current.CreationDate -ne $process.CreationDate -or $current.CommandLine -ne $process.CommandLine) {
        throw "Process PID $($process.ProcessId) changed ownership. Restart aborted."
    }
    if (Test-Path -LiteralPath $logger) {
        & $logger -Event 'restart-stop-requested' -Owner 'clinic' -ProjectPath $clinicRoot -Detail "Verified Clinic web/API PID $($process.ProcessId); persistent MySQL preserved."
    }
    try { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop }
    catch { if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) { throw } }
}
$deadline = [DateTime]::UtcNow.AddSeconds(10)
while (@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(3100, 3101) }).Count) {
    if ([DateTime]::UtcNow -ge $deadline) { throw 'Clinic ports 3100/3101 did not close. No alternate ports selected.' }
    Start-Sleep -Milliseconds 100
}
if ($plan.Count) { Write-Output 'Previous Clinic web/API workers stopped. MySQL preserved; restarting on ports 3100/3101.' }
