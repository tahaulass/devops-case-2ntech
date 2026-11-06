# Windows / PowerShell version of create-secrets.sh.
# Creates the Kubernetes Secrets with random passwords. Nothing is written to disk or git.
#   .\scripts\create-secrets.ps1
#   $env:GITHUB_TOKEN = "ghp_xxx"; .\scripts\create-secrets.ps1     # optional token
param([string]$Namespace = "mern")
$ErrorActionPreference = "Stop"

function New-RandomPassword {
  $chars = [char[]]"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}
# --ignore-not-found: kubectl prints nothing (and no error) when the object does not exist.
# Avoids Windows PowerShell 5.1 turning kubectl's "NotFound" stderr into a terminating error.
function Test-Secret($name) {
  $found = kubectl -n $Namespace get secret $name --ignore-not-found -o name
  return [bool]$found
}

$ns = kubectl get namespace $Namespace --ignore-not-found -o name
if (-not $ns) { kubectl create namespace $Namespace | Out-Null }

$mongoHost = "mongo-0.mongo.$Namespace.svc.cluster.local:27017"

if (-not (Test-Secret "mongo-root")) {
  $rootPw = New-RandomPassword
  kubectl -n $Namespace create secret generic mongo-root `
    --from-literal=MONGO_INITDB_ROOT_USERNAME=root `
    --from-literal=MONGO_INITDB_ROOT_PASSWORD=$rootPw `
    --from-literal=MONGODB_ROOT_URI="mongodb://root:$rootPw@$mongoHost/?authSource=admin"
} else { Write-Host "secret mongo-root already exists, keeping it" }

if (-not (Test-Secret "mongo-app")) {
  $appPw = New-RandomPassword
  kubectl -n $Namespace create secret generic mongo-app `
    --from-literal=MONGO_APP_USERNAME=app `
    --from-literal=MONGO_APP_PASSWORD=$appPw `
    --from-literal=MONGODB_URI="mongodb://app:$appPw@$mongoHost/employees?authSource=employees"
} else { Write-Host "secret mongo-app already exists, keeping it" }

if ($env:GITHUB_TOKEN -and -not (Test-Secret "github-token")) {
  kubectl -n $Namespace create secret generic github-token --from-literal=GITHUB_TOKEN=$env:GITHUB_TOKEN
}
if ($env:ALERT_WEBHOOK_URL -and -not (Test-Secret "alerting")) {
  kubectl -n $Namespace create secret generic alerting --from-literal=ALERT_WEBHOOK_URL=$env:ALERT_WEBHOOK_URL
}
Write-Host "done"
