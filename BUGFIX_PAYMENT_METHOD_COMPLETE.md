# Bugfix Completo: Remoção de `payment_method` do Pipeline de Importação

## Problema
Erro ao importar extrato CSV: `Could not find the 'payment_method' column of 'transactions' in the schema cache`

**Evidência**: Logs mostram que o payload de insert ainda continha `payment_method` mesmo após remoções anteriores.

## Causa Raiz
1. Objetos `parsed` do CSV podiam conter campos extras ao serem serializados para JSON
2. Falta de sanitização obrigatória antes de inserir no banco
3. Múltiplos pontos de inserção sem proteção contra campos inválidos

## Solução Implementada

### ✅ 1. Criado Módulo de Sanitização (`transactionSanitizer.ts`)
**Arquivo**: `src/services/transactionSanitizer.ts`

- Função `sanitizeTransactionForInsert()` usando whitelist de campos válidos
- Função `sanitizeTransactionsBatch()` para arrays
- Whitelist explícita de campos permitidos no schema `transactions`
- **Exclusão explícita**: `payment_method` não está na whitelist

### ✅ 2. Sanitização no Frontend (`csvImportService.ts`)
**Arquivo**: `src/services/csvImportService.ts`

**Mudanças**:
- `importTransactions()`: Sanitiza `validTransactions` antes de enviar para edge function
- `directImport()`: Aplica sanitização antes de inserir em lote
- Garante que apenas campos esperados sejam enviados

### ✅ 3. Sanitização na Edge Function (`import-csv`)
**Arquivo**: `supabase/functions/import-csv/index.ts`

**Mudanças**:
- Função `sanitizeTransactionForInsert()` usando whitelist
- Aplicada em cada objeto antes de adicionar ao array `toInsert`
- Proteção dupla: sanitização do objeto recebido + sanitização antes do insert

### ✅ 4. Sanitização em `transactionService.ts`
**Arquivo**: `src/services/transactionService.ts`

**Mudanças**:
- `addTransaction()`: Sanitiza objeto antes de inserir
- Proteção contra campos extras vindos do frontend

### ✅ 5. Sanitização em `installmentService.ts`
**Arquivo**: `src/services/installmentService.ts`

**Mudanças**:
- Sanitiza array de transações antes de inserir em lote
- Proteção para criação de parcelas

### ✅ 6. Sanitização em `clara-chat` Edge Function
**Arquivo**: `supabase/functions/clara-chat/index.ts`

**Mudanças**:
- Função `sanitizeTransactionClara()` com whitelist
- `addTransaction()`: Sanitiza antes de inserir
- Proteção para transações criadas via chat AI

## Whitelist de Campos Válidos

```typescript
const VALID_TRANSACTION_FIELDS = [
  "user_id",
  "household_id",
  "description",
  "amount",
  "category",
  "status",
  "transaction_date",
  "notes",
  "is_recurring",
  "account_id",
  "credit_card_id",
  "member_id",
  "due_date",
  "created_at",
  "updated_at",
  // Explicitly excluded: payment_method
];
```

## Pontos de Inserção Protegidos

1. ✅ `src/services/csvImportService.ts` → `importTransactions()` (envio para edge function)
2. ✅ `src/services/csvImportService.ts` → `directImport()` (fallback direto)
3. ✅ `supabase/functions/import-csv/index.ts` → batch insert
4. ✅ `src/services/transactionService.ts` → `addTransaction()`
5. ✅ `src/services/installmentService.ts` → criação de parcelas
6. ✅ `supabase/functions/clara-chat/index.ts` → `addTransaction()`

## Benefícios da Abordagem

1. **Proteção Futura**: Qualquer campo removido do schema será automaticamente filtrado
2. **Defesa em Profundidade**: Múltiplas camadas de sanitização
3. **Manutenibilidade**: Whitelist centralizada facilita atualizações
4. **Debugging**: Fácil identificar campos inválidos sendo enviados

## Testes Recomendados

1. **Teste de Importação CSV**:
   - Criar CSV com campo `payment_method` (se ainda existir em dados antigos)
   - Verificar que campo é removido antes do insert
   - Confirmar que importação funciona sem erros

2. **Teste de Sanitização**:
   ```typescript
   const txWithExtra = {
     description: "Test",
     amount: 100,
     payment_method: "pix", // Campo inválido
     invalid_field: "test"   // Campo inválido
   };
   const sanitized = sanitizeTransactionForInsert(txWithExtra);
   expect(sanitized.payment_method).toBeUndefined();
   expect(sanitized.invalid_field).toBeUndefined();
   ```

3. **Teste E2E**:
   - Importar extrato completo
   - Verificar logs do servidor (não deve haver erros de schema)
   - Confirmar que todas as transações foram inseridas

## Próximos Passos

1. ✅ **Código corrigido** - Todas as inserções estão protegidas
2. ⚠️ **Aplicar Migration** - Executar `20260218000000_remove_payment_method.sql` no banco
3. ⚠️ **Testar Importação** - Validar que erro não ocorre mais
4. ⚠️ **Monitorar Logs** - Verificar se há outros campos inválidos sendo enviados

## Arquivos Modificados

1. `src/services/transactionSanitizer.ts` - **NOVO** - Módulo de sanitização
2. `src/services/csvImportService.ts` - Sanitização em import flow
3. `supabase/functions/import-csv/index.ts` - Sanitização na edge function
4. `src/services/transactionService.ts` - Sanitização em addTransaction
5. `src/services/installmentService.ts` - Sanitização em criação de parcelas
6. `supabase/functions/clara-chat/index.ts` - Sanitização em chat AI

## Status
✅ **COMPLETO** - Todos os pontos de inserção estão protegidos com sanitização obrigatória
