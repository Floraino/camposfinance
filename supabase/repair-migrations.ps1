# Marca TODAS as 24 migrations como "applied" no banco remoto.
# Use DEPOIS de ter rodado o arquivo RUN_THIS_IN_SUPABASE_SQL_EDITOR.sql
# no SQL Editor do Supabase (assim o CLI fica em sync e db push nao tenta rodar nada de novo).
# Execute na pasta do projeto, SEM abrir o Cursor como administrador:
#   cd c:\Users\pedro1\Documents\cursor\camposfinance
#   .\supabase\repair-migrations.ps1

$versions = @(
  "20260203162706_84f06028-13c4-41c5-b851-31f95db1bf08",
  "20260203174304_2aa6c4b4-1cbd-4b88-98d1-3232075b5987",
  "20260203181049_f1930fc4-5bb2-42ca-8354-930a0c6b8403",
  "20260203182314_68bcff46-c81b-407c-b2e2-f3b4ef86e7c6",
  "20260203183219_7946fa10-387e-4098-a765-43df015c34b4",
  "20260203194403_8ac74374-c8bd-4630-88f8-353196417751",
  "20260204001100_69a49735-3aa3-462b-bad2-545ddda880ad",
  "20260204001136_5ffc27ca-9b2a-4610-b71d-682406b02477",
  "20260204003102_2a5f1714-b9c3-4cd2-bd75-3411c04ec6b8",
  "20260204003349_0a182ffb-3e46-4991-b1ac-7c3620e9a1ff",
  "20260204003715_f7eb1011-db34-4231-99ca-ce89637c369b",
  "20260204005300_3d482b54-d4f8-4df2-a8c4-35a2ae53ad82",
  "20260204115838_8486581d-01e5-43e2-9360-2a9c2e65853f",
  "20260204122056_c9b6f98c-a4cc-4c3c-b0b7-1a79e59fae87",
  "20260204122206_2d8c04de-f87f-47b0-bb4e-e3d789ccfb25",
  "20260204124743_98246cb9-cb5f-431d-b339-4f0767bef2de",
  "20260204145419_49ae4dba-8e94-46a9-b278-e0998a819da7",
  "20260204173829_a268a9eb-3a4a-4cdd-a04d-b5e6ad0839ca",
  "20260204175020_42ec33b0-391d-4787-8209-a328019f5e92",
  "20260206180000_admin_users_rpc",
  "20260206200000_split_by_member",
  "20260206210000_household_members_with_names",
  "20260206230000_add_due_date_to_transactions",
  "20260206231000_credit_cards_and_installments",
  "20260206232000_settlements"
)

Set-Location $PSScriptRoot\..

foreach ($v in $versions) {
  Write-Host "Repairing $v ..."
  npx supabase migration repair $v applied
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  (ignorando se ja aplicada)"
  }
}

Write-Host ""
Write-Host "Pronto. Agora 'npx supabase db push' nao tentara rodar migrations antigas."
