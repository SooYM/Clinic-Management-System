import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it.runIf(process.platform === 'win32')(
  'plans only verified Clinic process trees and rejects foreign port owners before stopping anything',
  () => {
    const directory = mkdtempSync(join(tmpdir(), 'clinic-restart-test-'));
    try {
      const probe = join(directory, 'probe.ps1');
      const helper = resolve('scripts/stop-local-app.ps1').replaceAll("'", "''");
      writeFileSync(
        probe,
        `
. '${helper}' -FunctionsOnly
$root = 'C:\\Clinic'
$processes = @(
  [pscustomobject]@{ProcessId=10;ParentProcessId=1000;Name='node.exe';CommandLine='node C:\\Clinic\\node_modules\\concurrently\\dist\\bin\\concurrently.js'},
  [pscustomobject]@{ProcessId=20;ParentProcessId=10;Name='cmd.exe';CommandLine='cmd /c npm run dev:api'},
  [pscustomobject]@{ProcessId=30;ParentProcessId=20;Name='node.exe';CommandLine='node C:\\Clinic\\node_modules\\tsx\\dist\\cli.mjs watch src/server/index.ts'},
  [pscustomobject]@{ProcessId=40;ParentProcessId=30;Name='node.exe';CommandLine='node C:\\Clinic\\node_modules\\tsx\\dist\\loader.mjs src/server/index.ts'},
  [pscustomobject]@{ProcessId=50;ParentProcessId=10;Name='mysqld.exe';CommandLine='C:\\Clinic\\mysqld.exe'},
  [pscustomobject]@{ProcessId=60;ParentProcessId=1000;Name='node.exe';CommandLine='node C:\\Other\\node_modules\\vite\\bin\\vite.js'},
  [pscustomobject]@{ProcessId=70;ParentProcessId=80;Name='powershell.exe';CommandLine='powershell.exe -File "C:\\Clinic\\start.ps1"'},
  [pscustomobject]@{ProcessId=80;ParentProcessId=1000;Name='powershell.exe';CommandLine='powershell.exe -File "C:\\Users\\QA\\.codex\\harness\\webapp.ps1" clinic management'}
)
$listeners = @([pscustomobject]@{LocalPort=3101;OwningProcess=40})
$plan = @(Get-ClinicStopPlan $processes $listeners $root)
$ids = @($plan | ForEach-Object { [int]$_.ProcessId })
if (($ids | Sort-Object) -join ',' -ne '10,20,30,40,70,80') { throw "Wrong process plan: $ids" }
foreach ($process in $plan) {
  if ($ids -contains [int]$process.ParentProcessId -and $ids.IndexOf([int]$process.ParentProcessId) -ge $ids.IndexOf([int]$process.ProcessId)) { throw 'Watcher stop order is unsafe' }
}
$rejected = $false
try { $null = @(Get-ClinicStopPlan $processes @([pscustomobject]@{LocalPort=3100;OwningProcess=60}) $root) }
catch { if ($_.Exception.Message -like '*unverified process*') { $rejected = $true } else { throw } }
if (-not $rejected) { throw 'Foreign listener must abort restart' }
Write-Output 'RESTART_PLAN_OK'
`,
      );
      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probe],
        {
          encoding: 'utf8',
          timeout: 15000,
          windowsHide: true,
        },
      );
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('RESTART_PLAN_OK');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
