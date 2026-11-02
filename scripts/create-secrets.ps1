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
function Test-Secret($name) {
  kubectl -n $Namespace get secret $name 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

kubectl get ns $Namespace 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { kubectl create ns $Namespace | Out-Null }

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
