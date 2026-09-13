$ErrorActionPreference = 'Stop'
$rhythmRoot = 'D:\知乎黑客松\four-seasons-life'
$rhythmPort = 4174
$rhythmExisting = Get-NetTCPConnection -LocalPort $rhythmPort -State Listen -ErrorAction SilentlyContinue
if ($rhythmExisting) { throw '4174 已有服务；保留现有进程，请先检查。' }
$rhythmStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rhythmLogs = Join-Path $rhythmRoot 'test-results\journey-rhythm'
$env:PORT = "$rhythmPort"
$rhythmProcess = Start-Process -FilePath 'D:\Program Files\nodejs\node.exe' -ArgumentList '"D:\知乎黑客松\four-seasons-life\server.mjs"' -WorkingDirectory $rhythmRoot -WindowStyle Hidden -RedirectStandardOutput "$rhythmLogs\preview-$rhythmStamp.log" -RedirectStandardError "$rhythmLogs\preview-$rhythmStamp.err.log" -PassThru
[pscustomobject]@{ ProcessId=$rhythmProcess.Id; URL="http://127.0.0.1:$rhythmPort/" } | ConvertTo-Json
