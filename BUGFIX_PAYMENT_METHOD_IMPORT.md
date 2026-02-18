# Bugfix: Remoção completa de `payment_method` do pipeline de importação

## Problema
Erro ao importar extrato CSV: `Could not find the 'payment_method' column of 'transactions' in the schema cache`

## Causa Raiz
A coluna `payment_method` foi removida do schema do banco de dados, mas ainda havia referências no código de importação e nos tipos TypeScript.

## Correções Aplicadas

### ✅ 1. CSV Template e Interfaces
- **Arquivo**: `src/services/csvImportService.ts`
- **Mudanças**:
  - Removido `forma_pagamento` de `CSV_TEMPLATE_HEADER`
  - Removido `forma_pagamento` de `ConvertedTransaction` interface
  - Removido `forma_pagamento` de `convertBankStatement()`
  - Removido `forma_pagamento` de `generateStandardCSV()`
  - Removido `forma_pagamento` de comentários e exemplos do template
  - Atualizado `parseStandardCSV()` para não ler mais `paymentStr` (agora lê `contaStr`)

### ✅ 2. Edge Function de Importação
- **Arquivo**: `supabase/functions/import-csv/index.ts`
- **Mudanças**:
  - Adicionada função `sanitizeTransactionForInsert()` para garantir que apenas campos válidos sejam inseridos
  - Objetos de insert agora passam por sanitização explícita
  - Comentários adicionados explicando exclusão de `payment_method`

### ✅ 3. Tipos TypeScript
- **Arquivo**: `src/integrations/supabase/types.ts`
- **Mudanças**:
  - Removido `payment_method` de `transactions.Row`
  - Removido `payment_method` de `transactions.Insert`
  - Removido `payment_method` de `transactions.Update`
  - **Nota**: `payment_method` em `split_participants` foi mantido (funcionalidade diferente)

### ✅ 4. Testes
- **Arquivo**: `src/test/csvImportService.test.ts`
- **Mudanças**:
  - Atualizados testes para refletir novo formato CSV sem `forma_pagamento`
  - Headers de teste atualizados

### ✅ 5. Código de Insert Direto
- **Arquivo**: `src/services/csvImportService.ts` (função `directImport`)
- **Status**: Já estava correto - objetos são construídos explicitamente sem `payment_method`

## Validação

### Campos permitidos em `transactions` insert:
```typescript
{
  user_id: string
  household_id: string
  description: string
  amount: number
  category: string
  status: string
  transaction_date: string
  notes?: string | null
  is_recurring: boolean
  account_id?: string | null
  credit_card_id?: string | null
  created_at: string
  updated_at: string
  // member_id, due_date podem ser incluídos se necessário
}
```

### Campos explicitamente excluídos:
- ❌ `payment_method` (removido do schema)

## Próximos Passos

### 1. Aplicar Migration no Banco
Execute a migration `20260218000000_remove_payment_method.sql`:

```sql
ALTER TABLE public.transactions 
DROP COLUMN IF EXISTS payment_method;
```

**Como aplicar:**
- Via Supabase Dashboard → SQL Editor (cole e execute)
- Ou via CLI: `npm run db:push` (após sincronizar estado das migrations)

### 2. Regenerar Tipos TypeScript (Opcional)
Após aplicar a migration, você pode regenerar os tipos:

```bash
npx supabase gen types typescript --project-id fnuqadvfdllnuchlorjd > src/integrations/supabase/types.ts
```

**Nota**: Os tipos já foram corrigidos manualmente, mas regenerar garante sincronização completa.

### 3. Testar Importação
1. Faça upload de um CSV de extrato
2. Verifique que não há erros relacionados a `payment_method`
3. Confirme que as transações são importadas corretamente

## Arquivos Modificados

1. `src/services/csvImportService.ts` - Remoção de `forma_pagamento` do template e funções relacionadas
2. `supabase/functions/import-csv/index.ts` - Adição de sanitização explícita
3. `src/integrations/supabase/types.ts` - Remoção de `payment_method` dos tipos
4. `src/test/csvImportService.test.ts` - Atualização de testes

## Status
✅ **Código corrigido** - Pronto para aplicar migration e testar
