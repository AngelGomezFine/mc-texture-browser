# MC Texture Browser - Instalador
# Uso: irm https://raw.githubusercontent.com/AngelGomezFine/mc-texture-browser/main/install.ps1 | iex

$repo  = "AngelGomezFine/mc-texture-browser"
$api   = "https://api.github.com/repos/$repo/releases/latest"

Write-Host "Buscando la ultima version..." -ForegroundColor Cyan
$release = Invoke-RestMethod $api
$asset   = $release.assets | Where-Object { $_.name -like "*.vsix" } | Select-Object -First 1

if (-not $asset) {
    Write-Host "No se encontro un archivo .vsix en la ultima release." -ForegroundColor Red
    exit 1
}

$file = "$env:TEMP\$($asset.name)"
Write-Host "Descargando $($asset.name)..." -ForegroundColor Cyan
Invoke-WebRequest $asset.browser_download_url -OutFile $file

Write-Host "Instalando en VS Code..." -ForegroundColor Cyan
code --install-extension $file

Remove-Item $file
Write-Host "Listo! Reinicia VS Code si la extension no aparece." -ForegroundColor Green
