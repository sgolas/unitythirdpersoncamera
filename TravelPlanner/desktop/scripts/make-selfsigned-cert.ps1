<#
  make-selfsigned-cert.ps1 — free code-signing path for Trip Planner desktop.

  Generates a self-signed code-signing certificate, exports it to a password-
  protected .pfx, and prints the exact values to paste into the two GitHub
  repository secrets the CI workflow reads:

      WINDOWS_CERT_BASE64      (the .pfx, base64-encoded on one line)
      WINDOWS_CERT_PASSWORD    (the password you choose below)

  Run in PowerShell on Windows (no admin needed):

      cd TravelPlanner\desktop\scripts
      .\make-selfsigned-cert.ps1

  NOTE: a self-signed cert makes CI produce a *signed* build and is perfect for
  proving the pipeline end-to-end, but it is NOT trusted by other people's
  machines — Windows SmartScreen will still warn your users. To remove that
  warning for real you need a cloud signing service (e.g. Azure Trusted
  Signing); ask and I'll rewire the workflow for it.
#>

param(
  # Shown as the publisher name on the signature. Use your name/brand.
  [string]$Subject = "CN=sgolas",
  # Where to write the .pfx (kept out of git via .gitignore).
  [string]$OutFile = "cert.pfx",
  # Cert validity. Self-signed test certs don't need to be long-lived.
  [int]$Years = 3
)

$ErrorActionPreference = "Stop"

# Prompt for the export password (never hard-code it into the script/repo).
$pw = Read-Host -AsSecureString "Choose a password for the .pfx (you'll also paste it into the WINDOWS_CERT_PASSWORD secret)"

Write-Host "Creating self-signed code-signing certificate for $Subject ..."
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject $Subject `
  -KeyUsage DigitalSignature `
  -KeyAlgorithm RSA -KeyLength 2048 `
  -NotAfter (Get-Date).AddYears($Years) `
  -CertStoreLocation Cert:\CurrentUser\My

$pfxPath = Join-Path (Get-Location) $OutFile
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pw | Out-Null
Write-Host "Wrote $pfxPath"

# Base64 the .pfx on a single line (what GitHub secrets need).
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($pfxPath))
$b64Path = Join-Path (Get-Location) "cert.b64.txt"
Set-Content -Path $b64Path -Value $b64 -NoNewline
Write-Host "Wrote $b64Path (the base64 string, one line)"

# Clean the cert out of the personal store so it doesn't linger.
Remove-Item ("Cert:\CurrentUser\My\" + $cert.Thumbprint) -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=================================================================="
Write-Host " Next: add two repository secrets on GitHub"
Write-Host "   Settings > Secrets and variables > Actions > New repository secret"
Write-Host ""
Write-Host "   1) Name:  WINDOWS_CERT_BASE64"
Write-Host "      Value: the entire contents of cert.b64.txt"
Write-Host "   2) Name:  WINDOWS_CERT_PASSWORD"
Write-Host "      Value: the password you just entered"
Write-Host ""
Write-Host " Then push a desktop-v* tag (or re-run the workflow) and the build"
Write-Host " will be signed automatically. Delete cert.pfx / cert.b64.txt after"
Write-Host " you've stored the secrets."
Write-Host "=================================================================="
