import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderShareNote, SHARE_STATUSES } from '../tools/share-state.mjs';

// Pure fixtures only: never read a real private config or launch/stop a service.
const fixture = { publicHost: 'fixture-only.trycloudflare.com', passcode: 'fixture-only-passcode' };

test('only an active share note contains a usable URL and passcode', () => {
  for (const status of SHARE_STATUSES) {
    const note = renderShareNote(fixture, status);
    assert.equal(note.includes(fixture.passcode), status === 'active');
    assert.equal(note.includes(fixture.publicHost), status === 'active');
    assert.match(note, /状态：/);
  }
  assert.throws(() => renderShareNote({}, 'active'), /host and passcode/);
  assert.throws(() => renderShareNote(fixture, 'unknown'), /Unknown/);
});

test('failed cleanup explicitly warns that the old share might still be reachable', () => {
  const remaining = renderShareNote(fixture, 'failed', 2);
  assert.match(remaining, /旧链接可能仍可访问/);
  assert.doesNotMatch(remaining, /记录的分享进程已确认退出/);
  assert.match(renderShareNote(fixture, 'failed', 0), /记录的分享进程已确认退出/);
  assert.match(renderShareNote(fixture, 'pending'), /尚未发布/);
  assert.match(renderShareNote(fixture, 'closed'), /已关闭/);
});

test('PowerShell cleanup preserves live/unverifiable records and removes confirmed exits', { skip: process.platform !== 'win32' }, () => {
  const path = fileURLToPath(new URL('../share-playtest.ps1', import.meta.url)).replaceAll("'", "''");
  const script = `
    $ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
    $parseTokens=$null;$parseErrors=$null
    $ast=[System.Management.Automation.Language.Parser]::ParseFile('${path}',[ref]$parseTokens,[ref]$parseErrors)
    if($parseErrors.Count){throw 'Lifecycle script failed parsing.'}
    $definition=$ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Stop-OwnedRecords'},$true)[0]
    Invoke-Expression $definition.Extent.Text
    $script:alive=@{1001=$true;1002=$true;1003=$true;1004=$false};$script:order=@()
    function Stop-Owned($record){
      $script:order+=$record.pid
      switch($record.pid){1001{$script:alive[1001]=$false};1002{throw 'Synthetic stop denied.'};1003{throw 'Synthetic ownership unavailable.'};1004{throw 'Synthetic already exited.'}}
    }
    function Get-OwnedProcess($record){
      if($record.pid -eq 1003){throw 'Synthetic lookup failed.'}
      if($script:alive[$record.pid]){return [pscustomobject]@{ProcessId=$record.pid}}
      return $null
    }
    $records=@([pscustomobject]@{pid=1001;role='game';created='1'},[pscustomobject]@{pid=1002;role='tunnel';created='2'},[pscustomobject]@{pid=1003;role='gateway';created='3'},[pscustomobject]@{pid=1004;role='game';created='4'})
    $result=Stop-OwnedRecords $records
    if(($result.remaining.pid -join ',') -ne '1002,1003'){throw 'Cleanup lost or retained the wrong identities.'}
    if($result.failures.Count -ne 2){throw 'Cleanup did not report both unconfirmed records.'}
    if(($script:order[0..1] -join ',') -ne '1002,1003'){throw 'Tunnel and gateway must be stopped before the game.'}
    if($result.remaining[0].created -ne '2' -or $result.remaining[1].created -ne '3'){throw 'Original ownership timestamps were lost.'}
    Write-Output 'MOCK_CLEANUP_OK'
  `;
  const stdout = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true });
  assert.match(stdout, /MOCK_CLEANUP_OK/);
});
