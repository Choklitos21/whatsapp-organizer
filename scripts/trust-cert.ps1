param(
  [Parameter(Mandatory = $true)]
  [string]$CerPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $CerPath)) {
  Write-Host "ERROR: Certificate file not found at '$CerPath'" -ForegroundColor Red
  exit 1
}

# Check for admin rights
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host "ERROR: Administrator privileges required." -ForegroundColor Red
  Write-Host "Right-click PowerShell and select 'Run as administrator'." -ForegroundColor Yellow
  exit 1
}

Write-Host "Installing certificate '$CerPath' into Trusted Publishers store..." -ForegroundColor Cyan

try {
  $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CerPath)
  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("TrustedPublisher", "LocalMachine")
  $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
  $store.Add($cert)
  $store.Close()

  Write-Host "SUCCESS: Certificate installed!" -ForegroundColor Green
  Write-Host "SmartScreen will no longer block the installer." -ForegroundColor Green
} catch {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
