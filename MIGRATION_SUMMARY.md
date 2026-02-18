# Migração para Manus AI - Resumo

## ✅ Migração Completa

Toda a camada de IA do projeto foi migrada de Google Gemini API para Manus AI API.

## 📋 Arquivos Modificados

### Provider Centralizado
- ✅ `supabase/functions/_shared/manusProvider.ts` (NOVO)
  - Interface compatível com `geminiProvider.ts`
  - Suporta: `generateText`, `generateFromImage`, `generateStream`
  - Implementa retry com backoff, tratamento de erros, polling para tasks

### Edge Functions Atualizadas
- ✅ `supabase/functions/clara-chat/index.ts`
  - Migrado para usar `manusProvider.generateStream()`
  - Mantém compatibilidade com formato SSE OpenAI

- ✅ `supabase/functions/categorize-transaction/index.ts`
  - Migrado para usar `manusProvider.generateText()`
  - Mantém fallback para keywords quando API não disponível

- ✅ `supabase/functions/scan-receipt/index.ts`
  - Migrado para usar `manusProvider.generateFromImage()`
  - Suporta OCR de recibos com attachments base64

- ✅ `supabase/functions/analyze-csv/index.ts`
  - Migrado para usar `manusProvider.generateText()`
  - Análise inteligente de estrutura CSV

### Frontend
- ✅ `src/pages/Dashboard.tsx` - Mensagens de erro atualizadas
- ✅ `src/components/assistant/AssistantChat.tsx` - Mensagens de erro atualizadas
- ✅ `src/components/receipts/ReceiptScanner.tsx` - Mensagens de erro atualizadas

### Documentação
- ✅ `README.md` - Atualizado para mencionar Manus AI
- ✅ `.env.example` - Variáveis de ambiente atualizadas

## 🔧 Variáveis de Ambiente

### Obrigatórias
- `MANUS_API_KEY` - Chave da API Manus AI (obter em https://manus.ai)

### Opcionais
- `MANUS_BASE_URL` - URL base da API (default: `https://api.manus.ai`)
- `MANUS_MODEL` - Modelo a usar (default: `manus-1.6`)
  - Opções: `manus-1.6`, `manus-1.6-lite`, `manus-1.6-max`

## 🔄 Diferenças da API Manus vs Gemini

### Modelo de Execução
- **Gemini**: Request/Response direto
- **Manus**: Task-based (cria task → polling → resultado)

### Streaming
- **Gemini**: SSE nativo
- **Manus**: Simulado via polling (task completa → chunks emitidos)

### Visão
- **Gemini**: Suporte nativo via `inlineData`
- **Manus**: Via attachments com `fileData` base64

## ⚠️ Notas Importantes

1. **Polling**: O adapter faz polling a cada 500ms até a task completar (máx 60s)
2. **Streaming**: Streaming é simulado - chunks são emitidos quando a task completa
3. **Function Calling**: Manus não tem suporte nativo, mantido via parsing de texto (como antes)
4. **Retry**: Implementado retry com backoff para 429/5xx, não retry para 4xx (exceto 429)

## 🧪 Próximos Passos para Teste

1. Configure `MANUS_API_KEY` nos Secrets do Supabase
2. Faça deploy das Edge Functions atualizadas
3. Teste cada funcionalidade:
   - ✅ Chat do Odin (streaming)
   - ✅ Categorização de transações
   - ✅ OCR de recibos
   - ✅ Análise de CSV

## 📝 Compatibilidade

- ✅ Interface pública mantida (mesmos tipos/interfaces)
- ✅ Formato de mensagens mantido
- ✅ Formato SSE mantido (compatível com frontend)
- ✅ Fallbacks mantidos (keywords quando API indisponível)

## 🔍 Código Legado

O arquivo `supabase/functions/_shared/geminiProvider.ts` foi mantido para referência, mas não é mais usado. Pode ser removido após validação completa da migração.
