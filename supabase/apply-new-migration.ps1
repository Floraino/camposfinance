# Aplica apenas a migration mais recente (útil quando o estado do banco não está sincronizado)
# Uso: .\supabase\apply-new-migration.ps1

Set-Location $PSScriptRoot\..

Write-Host "Aplicando apenas a migration mais recente..." -ForegroundColor Cyan

# Encontra a migration mais recente
$latestMigration = Get-ChildItem -Path "supabase\migrations\*.sql" | Sort-Object Name -Descending | Select-Object -First 1

if (-not $latestMigration) {
    Write-Host "Nenhuma migration encontrada!" -ForegroundColor Red
    exit 1
}

Write-Host "Migration encontrada: $($latestMigration.Name)" -ForegroundColor Yellow
Write-Host "Conteúdo:" -ForegroundColor Cyan
Get-Content $latestMigration.FullName | Write-Host

Write-Host ""
Write-Host "Para aplicar esta migration manualmente:" -ForegroundColor Yellow
Write-Host "1. Acesse o Supabase Dashboard → SQL Editor" -ForegroundColor White
Write-Host "2. Cole o conteúdo acima" -ForegroundColor White
Write-Host "3. Clique em Run" -ForegroundColor White
Write-Host ""
Write-Host "Ou execute: npm run db:push:force (pode dar erro se migrations antigas já foram aplicadas)" -ForegroundColor Cyan
