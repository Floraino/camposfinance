# Correção Final: Erro `payment_method` na Importação CSV

## Status
✅ **Edge Function atualizada e deployada**
⚠️ **Verificar se a migration foi aplicada no banco de dados**

## O que foi feito

### 1. Edge Function Atualizada
- ✅ Código atualizado com múltiplas camadas de sanitização
- ✅ Deploy realizado com sucesso
- ✅ Logs de debug adicionados para rastreamento

### 2. Proteções Implementadas
- ✅ Sanitização inicial ao receber transações do frontend
- ✅ Construção manual de objetos usando apenas campos da whitelist
- ✅ Sanitização antes de adicionar ao array `toInsert`
- ✅ Reconstrução final usando apenas campos da whitelist antes do insert
- ✅ Verificação explícita e remoção de `payment_method` em cada etapa
- ✅ Logs detalhados em cada etapa do processo

## Próximos Passos

### 1. Verificar se a Migration foi Aplicada
A migration `20260218000000_remove_payment_method.sql` precisa estar aplicada no banco:

```sql
ALTER TABLE public.transactions 
DROP COLUMN IF EXISTS payment_method;
```

**Como verificar:**
1. Acesse o Supabase Dashboard → SQL Editor
2. Execute:
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'transactions' 
AND column_name = 'payment_method';
```
3. Se retornar vazio, a coluna foi removida ✅
4. Se retornar uma linha, a migration não foi aplicada ❌

**Como aplicar a migration:**
- Opção A: Via SQL Editor (recomendado)
  1. Acesse Supabase Dashboard → SQL Editor
  2. Cole e execute o conteúdo de `supabase/migrations/20260218000000_remove_payment_method.sql`
  
- Opção B: Via CLI
  ```bash
  npx supabase db push
  ```

### 2. Testar a Importação
Após confirmar que a migration foi aplicada:

1. Limpe o cache do navegador (Ctrl+Shift+R)
2. Execute o fluxo de importação CSV
3. Verifique os logs no Supabase Dashboard → Edge Functions → `import-csv` → Logs
4. Procure por logs `[DEBUG][import-csv]` que mostram o payload exato sendo enviado

### 3. Verificar Logs de Debug
Os logs devem mostrar:
- `[DEBUG][import-csv] Body received` - mostra se `defaultPaymentMethod` está sendo enviado
- `[DEBUG][import-csv] Transaction X received` - mostra campos recebidos do frontend
- `[DEBUG][import-csv] InsertObj X before sanitize` - mostra objeto antes da sanitização
- `[DEBUG][import-csv] Sanitized X after sanitize` - mostra objeto após sanitização
- `[DEBUG][import-csv] Final batch X EXACT payload before insert` - mostra payload final antes do insert

Se aparecer `[ERROR][import-csv] payment_method found in final object!`, isso indica que `payment_method` está sendo adicionado em algum lugar antes do insert final.

## Possíveis Causas se o Erro Persistir

1. **Migration não aplicada**: A coluna `payment_method` ainda existe no banco
2. **Cache do schema**: O Supabase pode estar usando cache antigo (atualiza automaticamente após alguns minutos)
3. **Código antigo rodando**: Verifique se a edge function foi atualizada corretamente

## Solução de Problemas

### Se o erro persistir após aplicar a migration:
1. Aguarde 2-3 minutos para o cache do schema atualizar
2. Verifique os logs `[DEBUG][import-csv]` para ver onde `payment_method` está sendo incluído
3. Se necessário, force atualização do cache reiniciando o serviço (não é necessário normalmente)

### Se os logs de debug não aparecerem:
- Verifique se a edge function foi atualizada corretamente
- Verifique se está olhando os logs corretos (Edge Functions → `import-csv` → Logs)
- Os logs podem estar em um deployment diferente

## Arquivos Modificados

- ✅ `supabase/functions/import-csv/index.ts` - Edge function com sanitização completa
- ✅ `src/services/csvImportService.ts` - Sanitização no frontend
- ✅ `src/services/transactionSanitizer.ts` - Módulo de sanitização centralizado
- ✅ `src/services/transactionService.ts` - Sanitização em inserções individuais
- ✅ `src/services/installmentService.ts` - Sanitização em compras parceladas
