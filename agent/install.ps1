param(
  [Parameter(Mandatory=$true)]
  [string]$EnrollmentUrl
)
$ErrorActionPreference = "Stop"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "Node.js 20+ is required. Install it from https://nodejs.org/ and run this installer again."
}
$major = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($major -lt 20) { throw "Node.js 20 or newer is required." }

$uri = [Uri]$EnrollmentUrl
$apiRoot = $uri.GetLeftPart([UriPartial]::Authority)
$installDir = Join-Path $env:ProgramFiles "GodsGate"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Invoke-WebRequest -Uri "$apiRoot/downloads/agent.mjs" -OutFile (Join-Path $installDir "agent.mjs")
node (Join-Path $installDir "agent.mjs") --enroll $EnrollmentUrl

$nodePath = (Get-Command node).Source
$scriptPath = Join-Path $installDir "agent.mjs"
$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$scriptPath`""
$currentUser = "$env:USERDOMAIN\$env:USERNAME"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName "GodsGateDefenseAgent" -Action $action -Trigger $trigger -Principal $principal -Description "God's Gate Defense telemetry agent" -Force | Out-Null
Start-ScheduledTask -TaskName "GodsGateDefenseAgent"
Write-Host "God's Gate agent installed and scheduled at user logon."
