# Script para aplicar apenas migrations novas no banco remoto
# Detecta automaticamente quais migrations já foram aplicadas e aplica apenas as novas

param(
    [switch]$Force = $false
)

Set-Location $PSScriptRoot\..

Write-Host "Verificando migrations pendentes..." -ForegroundColor Cyan

# Lista todas as migrations locais
$localMigrations = Get-ChildItem -Path "supabase\migrations\*.sql" | Sort-Object Name | ForEach-Object { 
    $_.BaseName 
}

Write-Host "Migrations locais encontradas: $($localMigrations.Count)" -ForegroundColor Yellow

if ($Force) {
    Write-Host "Modo FORCE: aplicando todas as migrations (pode dar erro se já aplicadas)" -ForegroundColor Yellow
    npx supabase db push --include-all
    exit $LASTEXITCODE
}

# Tenta aplicar apenas as novas (o CLI já faz isso automaticamente)
# Usa --yes para não pedir confirmação interativa
Write-Host "Aplicando migrations pendentes..." -ForegroundColor Cyan
$env:SUPABASE_DB_PASSWORD = Read-Host "Digite a senha do banco" -AsSecureString | ConvertFrom-SecureString -AsPlainText
npx supabase db push --yes

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Erro ao aplicar migrations. Possíveis causas:" -ForegroundColor Red
    Write-Host "1. Algumas migrations já foram aplicadas manualmente no banco" -ForegroundColor Yellow
    Write-Host "2. O estado do banco não está sincronizado com o CLI" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Soluções:" -ForegroundColor Cyan
    Write-Host "  - Execute: .\supabase\repair-migrations.ps1 (para marcar antigas como aplicadas)" -ForegroundColor White
    Write-Host "  - Ou use: npm run db:push:force (para forçar aplicação de todas)" -ForegroundColor White
    Write-Host ""
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Migrations aplicadas com sucesso!" -ForegroundColor Green
