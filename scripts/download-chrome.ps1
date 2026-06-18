param(
  [string]$Version = "146.0.7680.31",
  [string]$OutputDir = (Join-Path (Split-Path $PSScriptRoot -Parent) "chromium")
)

$ErrorActionPreference = "Stop"

$chromeExe = Join-Path $OutputDir "chrome-win64\chrome.exe"
$versionFile = Join-Path $OutputDir "version.txt"

# Skip if Chrome already exists with the right version
if ((Test-Path $chromeExe) -and (Test-Path $versionFile)) {
  $existing = (Get-Content $versionFile -Raw).Trim()
  if ($existing -eq $Version) {
    Write-Host "Chrome for Testing $Version already downloaded. Skipping." -ForegroundColor Green
    exit 0
  }
}

# Clean and recreate directory
if (Test-Path $OutputDir) {
  Remove-Item -Recurse -Force $OutputDir
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

Write-Host "Downloading Chrome for Testing $Version..." -ForegroundColor Cyan

$ZipUrl = "https://storage.googleapis.com/chrome-for-testing-public/$Version/win64/chrome-win64.zip"
$ZipPath = Join-Path $env:TEMP "chrome-win64-$Version.zip"

try {
  $wc = New-Object System.Net.WebClient
  $wc.DownloadFile($ZipUrl, $ZipPath)
  Write-Host "Downloaded to $ZipPath" -ForegroundColor Green
} catch {
  Write-Host "ERROR: Failed to download Chrome for Testing: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host "Extracting..." -ForegroundColor Cyan
try {
  Expand-Archive -Path $ZipPath -DestinationPath $OutputDir -Force
  Write-Host "Extracted to $OutputDir" -ForegroundColor Green
} catch {
  Write-Host "ERROR: Failed to extract: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Clean up zip
Remove-Item -Force $ZipPath -ErrorAction SilentlyContinue

# Write version marker
$Version | Out-File -FilePath $versionFile -Encoding ascii

# Verify Chrome exists
if (Test-Path $chromeExe) {
  Write-Host "SUCCESS: Chrome ready at $chromeExe" -ForegroundColor Green
} else {
  Write-Host "ERROR: chrome.exe not found at expected path $chromeExe" -ForegroundColor Red
  exit 1
}
