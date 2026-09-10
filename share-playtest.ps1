[CmdletBinding()]
param([ValidateSet('Start','Stop','Status')][string]$Action='Start')
# PowerShell 7 correctly uses the existing Windows proxy on this machine; do not
# alter proxy settings or expose proxy URLs/credentials to another child process.
if($PSVersionTable.PSVersion.Major -lt 7){
  $sharePwshCommand=Get-Command pwsh -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $sharePwsh=if($sharePwshCommand){$sharePwshCommand.Source}else{Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe'}
  if(Test-Path -LiteralPath $sharePwsh){
    & $sharePwsh -NoProfile -File $PSCommandPath -Action $Action
    exit $LASTEXITCODE
  }
}
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$projectRoot=$PSScriptRoot
$privateRoot=Join-Path $projectRoot '.private-share'
$statePath=Join-Path $privateRoot 'active.json'
$nodePath=(Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$tunnelPath=Join-Path $projectRoot 'tools\cloudflared\cloudflared.exe'
$gameScript=Join-Path $projectRoot 'server.mjs'
$gatewayScript=Join-Path $projectRoot 'server\share-gateway.mjs'
$helperScript=Join-Path $projectRoot 'tools\share-state.mjs'
$owned=@()
$runRoot=$null
$publicUrl=''

function Get-Record($process,$role) {
  $item=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$process.Id)
  if(-not $item){throw ('Process exited before ownership could be recorded: '+$role)}
  return [pscustomobject]@{pid=$process.Id;role=$role;created=$item.CreationDate.ToUniversalTime().Ticks.ToString()}
}
function Get-OwnedProcess($record) {
  if($record.role -notin @('game','gateway','tunnel')){throw 'Unrecognized process role in playtest state.'}
  # A failed ownership query is not evidence that a process has exited.
  $item=Get-CimInstance Win32_Process -Filter ('ProcessId = '+[int]$record.pid) -ErrorAction Stop
  if(-not $item){return $null}
  if($item.CreationDate.ToUniversalTime().Ticks.ToString() -ne [string]$record.created){return $null}
  if($record.role -eq 'tunnel'){
    if($item.ExecutablePath -ne $tunnelPath -or $item.CommandLine -notlike '*http://127.0.0.1:4175*'){throw 'Tunnel process ownership could not be verified.'}
  }else{
    $expectedScript=if($record.role -eq 'game'){$gameScript}else{$gatewayScript}
    if($item.ExecutablePath -ne $nodePath -or -not $item.CommandLine.Contains($expectedScript)){throw 'Game process ownership could not be verified.'}
    if($record.role -eq 'game' -and $item.CommandLine -notlike '*--production*'){throw 'Refusing to stop a development server.'}
  }
  return $item
}
function Stop-Owned($record) {
  $item=Get-OwnedProcess $record
  if(-not $item){return}
  Stop-Process -Id $item.ProcessId -ErrorAction Stop
  $deadline=[DateTime]::UtcNow.AddSeconds(3)
  do{
    if(-not(Get-OwnedProcess $record)){return}
    Start-Sleep -Milliseconds 100
  }while([DateTime]::UtcNow -lt $deadline)
  throw 'The recorded process has not confirmed its exit.'
}
function Stop-OwnedRecords($records) {
  $remaining=@();$failures=@()
  $ordered=@($records | Sort-Object @{Expression={switch($_.role){'tunnel'{0};'gateway'{1};'game'{2};default{3}}}})
  foreach($record in $ordered){
    $stopFailure=$null
    try{Stop-Owned $record}catch{$stopFailure=$_.Exception.Message}
    try{
      $live=Get-OwnedProcess $record
      if($live){
        $remaining+=$record
        $reason=if($stopFailure){$stopFailure}else{'Exit was not confirmed.'}
        $failures+=('{0} (PID {1}): {2}' -f $record.role,$record.pid,$reason)
      }
    }catch{
      # Retain identity metadata if either ownership or exit cannot be checked.
      $remaining+=$record
      $failures+=('{0} (PID {1}): ownership/exit could not be verified.' -f $record.role,$record.pid)
    }
  }
  return [pscustomobject]@{remaining=@($remaining);failures=@($failures)}
}
function Write-State($runRoot,$records,$url='',$status='pending',$cleanupErrors=@()) {
  $json=[pscustomobject]@{runRoot=$runRoot;processes=@($records);url=$url;status=$status;cleanupErrors=@($cleanupErrors)} | ConvertTo-Json -Depth 6
  $temporaryState=$statePath+'.tmp'
  [System.IO.File]::WriteAllText($temporaryState,$json,(New-Object System.Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $temporaryState -Destination $statePath -Force
}
function Set-ShareStatus($runRoot,$status,$remainingCount=0) {
  $configFile=if($runRoot){Join-Path $runRoot 'config.json'}else{$null}
  if($configFile -and (Test-Path -LiteralPath $configFile)){
    $result=& $nodePath $helperScript status $configFile $status $remainingCount
    if($LASTEXITCODE -eq 0){return $result}
  }
  # Fail closed in the human-readable note even if config creation/update failed.
  if(Test-Path -LiteralPath $privateRoot){
    $message="Four Seasons Life private playtest`r`nStatus: $status`r`nDo not share a previous URL or passcode."
    if($remainingCount -gt 0){$message+="`r`nSome processes are unconfirmed; run Stop again before assuming the link is closed."}
    $message | Set-Content -LiteralPath (Join-Path $privateRoot 'share-info.txt') -Encoding UTF8
  }
  throw 'Could not update the private playtest status; previous sharing details were hidden.'
}
function Test-Local($url,$code=200,$headers=@{}) {
  try{$response=Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 2 -MaximumRedirection 0;return $response.StatusCode -eq $code}catch{return $false}
}
function Wait-Local($url,$headers=@{}) {
  $deadline=[DateTime]::UtcNow.AddSeconds(15)
  while([DateTime]::UtcNow -lt $deadline){if(Test-Local $url 200 $headers){return};Start-Sleep -Milliseconds 200}
  throw ('Local playtest service did not become ready: '+$url)
}
function Wait-Public($url) {
  $deadline=[DateTime]::UtcNow.AddSeconds(240)
  $previousTls=[Net.ServicePointManager]::SecurityProtocol
  $lastFailure='unreachable'
  try{
    [Net.ServicePointManager]::SecurityProtocol=$previousTls -bor [Net.SecurityProtocolType]::Tls12
    while([DateTime]::UtcNow -lt $deadline){
      try{
        # Invoke-WebRequest honors the existing system proxy; Node fetch does not.
        $response=Invoke-WebRequest -Uri ($url+'/__share/login') -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 0
        if($response.StatusCode -eq 200 -and $response.Content.Contains('name="code"') -and $response.Content.Contains('action="/__share/login"')){return}
        $lastFailure='HTTP '+$response.StatusCode
      }catch{$lastFailure=$_.Exception.GetType().Name}
      Start-Sleep -Milliseconds 1500
    }
  }finally{[Net.ServicePointManager]::SecurityProtocol=$previousTls}
  throw ('The public login page is not reachable yet ('+$lastFailure+'). This run was not published; cleanup results follow.')
}
function Start-Child($file,$arguments,$role,$runRoot) {
  $process=Start-Process -FilePath $file -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot ($role+'.stdout.log')) -RedirectStandardError (Join-Path $runRoot ($role+'.stderr.log'))
  return Get-Record $process $role
}

$mutex=New-Object System.Threading.Mutex($false,'Local\FourSeasonsLife-PrivateShare')
$hasLock=$false
try{
  try{$hasLock=$mutex.WaitOne(20000)}catch [System.Threading.AbandonedMutexException]{$hasLock=$true}
  if(-not $hasLock){throw 'Another playtest operation is in progress.'}
  if(Test-Path -LiteralPath $statePath){
    $existing=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if($Action -eq 'Status'){
      $report=@($existing.processes | ForEach-Object {[pscustomobject]@{role=$_.role;pid=$_.pid;running=[bool](Get-OwnedProcess $_)}})
      $status=if($existing.PSObject.Properties['status']){$existing.status}elseif($existing.url){'active'}else{'pending'}
      [pscustomobject]@{status=$status;url=$(if($status -eq 'active'){$existing.url}else{''});processes=$report;note=(Join-Path $privateRoot 'share-info.txt')} | ConvertTo-Json -Depth 5
      exit 0
    }
    if($Action -eq 'Start'){
      $running=@($existing.processes | Where-Object {Get-OwnedProcess $_})
      if($running.Count -gt 0){Write-Output 'Existing playtest processes are recorded. Use Status to check readiness and Stop before starting a new link. No process was changed.';exit 0}
    }else{
      $runRoot=$existing.runRoot;$owned=@($existing.processes)
      $cleanup=Stop-OwnedRecords $owned;$owned=@($cleanup.remaining)
      $status=if($owned.Count){'failed'}else{'closed'}
      Write-State $runRoot $owned '' $status $cleanup.failures
      Set-ShareStatus $runRoot $status $owned.Count | Out-Null
      if($owned.Count -gt 0){
        foreach($failure in $cleanup.failures){Write-Warning $failure}
        Write-Error 'Private playtest is not fully stopped. Unconfirmed process records were retained; retry Stop.' -ErrorAction Continue
        exit 1
      }
      Write-Output 'Private playtest stopped. The local development game was not changed.'
      exit 0
    }
  }elseif($Action -ne 'Start'){Write-Output 'No private playtest is running.';exit 0}

  foreach($checkPort in @(4174,4175,20491)){
    if(Get-NetTCPConnection -State Listen -LocalPort $checkPort -ErrorAction SilentlyContinue){throw ('Port '+$checkPort+' is occupied. No existing process was changed.')}
  }
  $source=Get-Content -LiteralPath (Join-Path $projectRoot 'tools\cloudflared-source.json') -Raw | ConvertFrom-Json
  if(-not(Test-Path -LiteralPath $tunnelPath) -or (Get-FileHash -LiteralPath $tunnelPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $source.sha256){throw 'Verified cloudflared executable is missing. Do not start an unverified binary.'}
  [void][System.IO.Directory]::CreateDirectory($privateRoot)
  $userSid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $privateRoot /inheritance:r /grant:r "*${userSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Could not restrict the private sharing directory permissions.'}
  $runRoot=Join-Path $privateRoot ('runs\'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
  $configPath=Join-Path $runRoot 'config.json'
  & $nodePath $helperScript create $runRoot | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Could not create private playtest configuration.'}
  $siteRoot=Join-Path $runRoot 'site'
  Push-Location -LiteralPath $projectRoot
  try{
    & $nodePath (Join-Path $projectRoot 'node_modules\vite\bin\vite.js') build --outDir $siteRoot
    if($LASTEXITCODE -ne 0){throw 'Production playtest build failed.'}
  }finally{Pop-Location}
  $previousPort=$env:PORT;$previousDist=$env:GAME_DIST_ROOT;$previousConfig=$env:SHARE_CONFIG_PATH
  try{
    $env:PORT='4174';$env:GAME_DIST_ROOT=$siteRoot
    $owned+=Start-Child $nodePath ('"'+$gameScript+'" --production') 'game' $runRoot
    Write-State $runRoot $owned
    Wait-Local 'http://127.0.0.1:4174/api/health'
    $env:SHARE_CONFIG_PATH=$configPath
    $owned+=Start-Child $nodePath ('"'+$gatewayScript+'"') 'gateway' $runRoot
    Write-State $runRoot $owned
    Wait-Local 'http://127.0.0.1:4175/__share/login'
    & $nodePath --input-type=module -e "const r=await fetch('http://127.0.0.1:4175/api/health',{redirect:'manual'});if(r.status!==401)process.exit(1);const p=await fetch('http://127.0.0.1:4175/',{redirect:'manual'});if(p.status!==303)process.exit(1);"
    if($LASTEXITCODE -ne 0){throw 'Authentication safety check failed. Nothing was exposed publicly.'}
    $owned+=Start-Child $tunnelPath 'tunnel --no-autoupdate --protocol http2 --loglevel info --transport-loglevel warn --management-diagnostics=false --url http://127.0.0.1:4175 --metrics 127.0.0.1:20491' 'tunnel' $runRoot
    Write-State $runRoot $owned
    $deadline=[DateTime]::UtcNow.AddSeconds(45);$publicUrl='';$tunnelLog=Join-Path $runRoot 'tunnel.stderr.log'
    while([DateTime]::UtcNow -lt $deadline){
      if(Test-Path -LiteralPath $tunnelLog){$log=Get-Content -LiteralPath $tunnelLog -Raw;if($log -match 'https://[a-z0-9-]+\.trycloudflare\.com'){$publicUrl=$Matches[0];break}}
      Start-Sleep -Milliseconds 300
    }
    if(-not $publicUrl){throw 'The tunnel did not return a public URL. Read the private tunnel log.'}
    Wait-Local 'http://127.0.0.1:20491/ready'
    & $nodePath $helperScript publish $configPath $publicUrl | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Could not save the sharing details.'}
    # Bind the authenticated gateway to this one public hostname.
    $oldGateway=$owned | Where-Object {$_.role -eq 'gateway'}
    Stop-Owned $oldGateway
    $owned=@($owned | Where-Object {$_.role -ne 'gateway'})
    $owned+=Start-Child $nodePath ('"'+$gatewayScript+'"') 'gateway' $runRoot
    Write-State $runRoot $owned $publicUrl
    Wait-Local 'http://127.0.0.1:4175/__share/login' @{Host=([uri]$publicUrl).Host}
    Wait-Public $publicUrl
    $published=Set-ShareStatus $runRoot 'active'
    Write-State $runRoot $owned $publicUrl 'active'
    Write-Output $published
    Write-Output 'Public login page is reachable. Keep this computer awake and online while friends play.'
  }finally{$env:PORT=$previousPort;$env:GAME_DIST_ROOT=$previousDist;$env:SHARE_CONFIG_PATH=$previousConfig}
}catch{
  $primaryError=$_
  if($runRoot){
    $cleanupFailures=@()
    try{$cleanup=Stop-OwnedRecords $owned;$owned=@($cleanup.remaining);$cleanupFailures=@($cleanup.failures)}catch{$cleanupFailures+=('Cleanup itself could not complete: '+$_.Exception.Message)}
    foreach($failure in $cleanupFailures){Write-Warning $failure}
    try{Write-State $runRoot $owned '' 'failed' $cleanupFailures}catch{Write-Warning ('Could not persist cleanup status: '+$_.Exception.Message)}
    try{Set-ShareStatus $runRoot 'failed' $owned.Count | Out-Null}catch{Write-Warning $_.Exception.Message}
    if($owned.Count -gt 0){Write-Warning 'The share may still be reachable. Live/unconfirmed process records were retained; run Stop again.'}
    else{Write-Output 'The incomplete share was stopped. No recorded playtest process remains.'}
  }
  Write-Error $primaryError.Exception.Message -ErrorAction Continue
  exit 1
}finally{if($hasLock){$mutex.ReleaseMutex()};$mutex.Dispose()}
