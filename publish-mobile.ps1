# One-time (or when you change web/) publish to GitHub Pages — open URL on phone, no PC.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$repoName = "stock-insight-mobile"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "GitHub CLI (gh) is required. Install: winget install GitHub.cli"
  exit 1
}

$docs = Join-Path $Root "docs"
if (Test-Path $docs) { Remove-Item $docs -Recurse -Force }
New-Item -ItemType Directory -Path $docs | Out-Null
Copy-Item -Path (Join-Path $Root "web\*") -Destination $docs -Recurse -Force

if (-not (Test-Path (Join-Path $Root ".git"))) {
  git init | Out-Null
}

if (-not (Test-Path ".gitignore")) {
  @"
.venv/
__pycache__/
*.pyc
.env
"@ | Set-Content ".gitignore" -Encoding utf8
}

git add docs publish-mobile.ps1 README.md .gitignore web 2>$null
git add docs publish-mobile.ps1 README.md .gitignore web
$status = git status --porcelain
if ($status) {
  git commit -m "Publish mobile web app (GitHub Pages)" | Out-Null
}

$remotes = git remote 2>$null
if (-not ($remotes -match "origin")) {
  gh repo create $repoName --public --source=. --remote=origin --push 2>&1 | Out-Host
} else {
  git push -u origin HEAD 2>&1 | Out-Host
}

$owner = (gh api user -q .login)
$full = "${owner}/${repoName}"

gh api "repos/$full/pages" -X POST -f build_type=legacy -f "source[branch]=main" -f "source[path]=/docs" 2>$null
if ($LASTEXITCODE -ne 0) {
  gh api "repos/$full/pages" -X PUT -f build_type=legacy -f "source[branch]=main" -f "source[path]=/docs" 2>$null
}

Start-Sleep -Seconds 3
$url = "https://$owner.github.io/$repoName/"
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " OPEN ON YOUR PHONE (bookmark or Add to Home Screen):" -ForegroundColor Cyan
Write-Host "   $url" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " GitHub may take 1-3 minutes the first time Pages builds." -ForegroundColor Yellow
Write-Host ""