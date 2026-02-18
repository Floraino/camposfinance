# Correção do Erro de Importação CSV

## Problema
Erro ao importar CSV: `Could not find the 'payment_method' column of 'transactions' in the schema cache`

## Causa
A coluna `payment_method` foi removida do código, mas:
1. A migration ainda não foi aplicada no banco de dados
2. O cache do schema do Supabase ainda referencia a coluna

## Soluções Aplicadas

### ✅ 1. Código Corrigido
- ✅ Removido `payment_method` de todos os componentes UI
- ✅ Removido `payment_method` dos serviços (`transactionService`, `csvImportService`, etc.)
- ✅ Removido `payment_method` das Edge Functions (`import-csv`, `scan-receipt`, etc.)
- ✅ Removido `payment_method` dos tipos TypeScript (`src/integrations/supabase/types.ts`)

### ⚠️ 2. Migration Pendente
A migration `20260218000000_remove_payment_method.sql` precisa ser aplicada no banco:

```sql
ALTER TABLE public.transactions 
DROP COLUMN IF EXISTS payment_method;
```

**Como aplicar:**
1. Acesse o Supabase Dashboard → SQL Editor
2. Cole e execute o SQL acima
3. Ou execute: `npm run db:push` (após sincronizar o estado das migrations)

### 🔄 3. Atualizar Cache do Schema
Após aplicar a migration, o cache do schema será atualizado automaticamente. Se o erro persistir:

1. Aguarde alguns minutos para o cache atualizar
2. Ou force atualização do cache (o Supabase faz isso automaticamente após migrations)

## Teste
Após aplicar a migration, teste novamente a importação CSV. O erro não deve mais ocorrer.

## Nota
Os tipos TypeScript foram atualizados manualmente. Após aplicar a migration, você pode regenerá-los com:
```bash
npx supabase gen types typescript --project-id SEU_PROJECT_REF > src/integrations/supabase/types.ts
```
