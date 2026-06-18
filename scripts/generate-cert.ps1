param(
  [string]$CertPassword = "WhatsAppOrg2026!",
  [string]$CertDir = (Join-Path (Split-Path $PSScriptRoot -Parent) "cert")
)

$ErrorActionPreference = "Stop"

# Ensure cert directory exists
New-Item -ItemType Directory -Path $CertDir -Force | Out-Null

$pfxPath   = Join-Path $CertDir "cert.pfx"
$cerPath   = Join-Path $CertDir "cert.cer"
$passPath  = Join-Path $CertDir "password.txt"

# Remove old cert files if they exist
@($pfxPath, $cerPath, $passPath) | ForEach-Object {
  if (Test-Path $_) { Remove-Item $_ -Force }
}

Write-Host "Generating self-signed code signing certificate..." -ForegroundColor Cyan

# Generate self-signed certificate (valid 5 years)
$cert = New-SelfSignedCertificate `
  -Subject "CN=WhatsApp Organizer, O=Choklitos, C=CO" `
  -FriendlyName "WhatsApp Organizer Code Signing" `
  -Type CodeSigningCert `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(5)

Write-Host "Certificate generated (thumbprint: $($cert.Thumbprint))" -ForegroundColor Green

# Export to .pfx (with private key, password-protected)
$securePass = ConvertTo-SecureString $CertPassword -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePass

# Export to .cer (public key only, for client trust script)
Export-Certificate -Cert $cert -FilePath $cerPath -Type CERT | Out-Null

# Save password for builds
[System.IO.File]::WriteAllText($passPath, $CertPassword)

Write-Host "Exported certificate:"    -ForegroundColor Cyan
Write-Host "  PFX (signing):    $pfxPath"  -ForegroundColor White
Write-Host "  CER (public key): $cerPath"  -ForegroundColor White
Write-Host "  Password saved:   $passPath" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT: Keep cert.pfx and password.txt secret!" -ForegroundColor Yellow
Write-Host "Share cert.cer with your client so they can trust the installer." -ForegroundColor Yellow
