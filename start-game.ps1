[CmdletBinding()]
param(
  [switch]$NoBrowser,
  [ValidateRange(1, 65535)]
  [int]$Port = 4173
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot

if (-not $PSBoundParameters.ContainsKey('Port') -and $env:PORT) {
  $configuredPort = 0
  if (-not [int]::TryParse($env:PORT, [ref]$configuredPort) -or $configuredPort -lt 1 -or $configuredPort -gt 65535) {
    Write-Error 'PORT must be an integer between 1 and 65535.'
    exit 1
  }
  $Port = $configuredPort
}
$gameUrl = 'http://127.0.0.1:' + $Port

function Test-GameHealth {
  try {
    $response = Invoke-RestMethod -Uri ($gameUrl + '/api/health') -Method Get -TimeoutSec 2 -ErrorAction Stop
    return ($response.ok -eq $true -and $response.game -eq 'four-seasons-life')
  } catch { return $false }
}

function Test-GamePort {
  $client = New-Object System.Net.Sockets.TcpClient
  try { return ($client.ConnectAsync('127.0.0.1', $Port).Wait(500) -and $client.Connected) }
  catch { return $false }
  finally { $client.Dispose() }
}

function Show-Game {
  if (-not $NoBrowser) { Start-Process -FilePath $gameUrl }
}

$launchMutex = New-Object System.Threading.Mutex($false, ('Local\FourSeasonsLife-' + $Port))
$hasLock = $false
try {
  try { $hasLock = $launchMutex.WaitOne(20000) }
  catch [System.Threading.AbandonedMutexException] { $hasLock = $true }
  if (-not $hasLock) { throw 'Another launcher is still starting the game. Try again shortly.' }

  if (Test-GameHealth) {
    Write-Output ('REUSED ' + $gameUrl + ' (existing four-seasons-life server)')
    Show-Game
    exit 0
  }
  if (Test-GamePort) { throw ('Port ' + $Port + ' is occupied by a different or unresponsive service. No process was changed. Choose another -Port.') }

  $nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $nodeCommand) { throw 'Node.js was not found. Install Node.js 22.12 or newer, then run this launcher again.' }
  $nodeVersion = (& $nodeCommand.Source --version | Out-String).Trim()
  if ($nodeVersion -notmatch '^v(\d+)\.(\d+)' -or [int]$Matches[1] -lt 22 -or ([int]$Matches[1] -eq 22 -and [int]$Matches[2] -lt 12)) {
    throw ('Node.js 22.12 or newer is required. Found: ' + $nodeVersion)
  }

  $logRoot = Join-Path $projectRoot 'test-results'
  [void][System.IO.Directory]::CreateDirectory($logRoot)
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\vite\package.json')) -or
      -not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\three\package.json'))) {
    $npmCommand = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $npmCommand) { throw 'npm was not found. Reinstall Node.js with npm enabled.' }
    Write-Output 'Installing project dependencies. This requires network access.'
    $installLog = Join-Path $logRoot 'dependency-install.log'
    Push-Location -LiteralPath $projectRoot
    try {
      & $npmCommand.Source install --no-audit --no-fund *> $installLog
      if ($LASTEXITCODE -ne 0) { throw ('Dependency installation failed. Read: ' + $installLog) }
    } finally { Pop-Location }
  }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  $stdoutLog = Join-Path $logRoot ('server-' + $stamp + '.stdout.log')
  $stderrLog = Join-Path $logRoot ('server-' + $stamp + '.stderr.log')
  $previousPort = $env:PORT
  try {
    $env:PORT = [string]$Port
    $gameProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList @('server.mjs') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
  } finally { $env:PORT = $previousPort }

  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-GameHealth) {
      Write-Output ('STARTED ' + $gameUrl + ' (PID ' + $gameProcess.Id + ')')
      Show-Game
      exit 0
    }
    $gameProcess.Refresh()
    if ($gameProcess.HasExited) { throw ('Game server exited during startup. Read: ' + $stderrLog) }
    Start-Sleep -Milliseconds 250
  }
  throw ('The server did not become ready in time. Read: ' + $stderrLog)
} catch {
  Write-Error -Message $_.Exception.Message -ErrorAction Continue
  exit 1
} finally {
  if ($hasLock) { $launchMutex.ReleaseMutex() }
  $launchMutex.Dispose()
}
