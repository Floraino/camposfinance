# CamposFinance

App de finanças por família com IA integrada (Manus AI).

## Tecnologias

- **Frontend**: Vite + React + TypeScript + Tailwind CSS + shadcn-ui
- **Backend**: Supabase (Auth, Database, Edge Functions)
- **IA**: Manus AI API (OCR, categorização, análise CSV, chat)

## Setup local

```sh
# 1. Clone o repositório
git clone <YOUR_GIT_URL>
cd camposfinance

# 2. Instale as dependências
npm install

# 3. Configure o .env (copie de .env.example)
cp .env.example .env
# Preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY

# 4. Inicie o servidor de desenvolvimento
npm run dev
```

## Variáveis de ambiente

### Frontend (.env)
| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave anon/pública do Supabase |

### Backend (Supabase Edge Functions Secrets)
| Variável | Descrição |
|---|---|
| `MANUS_API_KEY` | Chave da API Manus AI (obter em https://manus.ai - Dashboard → API Integration) |
| `STRIPE_SECRET_KEY` | Chave secreta Stripe (pagamentos) |
| `STRIPE_WEBHOOK_SECRET` | Secret do webhook Stripe |

## Features com IA

- **OCR de recibos**: Upload de imagem → Manus Vision → extração de dados
- **Importação CSV**: Parsing + Manus para mapeamento de colunas inteligente
- **Categorização**: Keywords local + Manus como fallback para descrições desconhecidas
- **Clara (chat)**: Assistente financeira com Manus AI

### Como ativar "Categorizar com IA"

Se aparecer **"IA indisponível"** ou **"parte sem IA"** ao categorizar transações:

1. **Faça o deploy da Edge Function** (uma vez por projeto):
   ```sh
   supabase login
   supabase link --project-ref SEU_PROJECT_REF
   supabase functions deploy categorize-transaction
   ```
2. **Configure a chave do Manus AI** no Supabase:
   - Dashboard do projeto → **Project Settings** → **Edge Functions** → **Secrets**
   - Adicione: `MANUS_API_KEY` = sua chave (obter em https://manus.ai - Dashboard → API Integration)
3. Opcional: sem `MANUS_API_KEY` a função ainda responde usando **apenas palavras-chave** (fallback). Com a chave, descrições difíceis são enviadas ao Manus AI para categorização.

Enquanto a IA não estiver configurada, o app usa **regras locais + cache** (histórico de categorizações manuais), então muitas transações são categorizadas mesmo assim.

**Erro de CORS ao categorizar (localhost)?**  
A mensagem *"Response to preflight request doesn't pass access control check"* ao rodar o app em `localhost` (ex.: `npm run preview` na porta 4173) costuma significar que a Edge Function **ainda não está publicada** no projeto. O preflight (OPTIONS) recebe 404/502 em vez de 200. Depois de fazer o deploy com `supabase functions deploy categorize-transaction`, a função passa a responder com os headers CORS corretos e o erro some. Alternativa para desenvolvimento: rodar a função localmente com `supabase functions serve categorize-transaction` e usar um projeto Supabase local (`supabase start` + URL local no `.env`).

## Testes

```sh
npm run test
```

## PWA (app instalável e offline)

O app é um PWA: pode ser instalado no celular ou desktop e funciona com cache básico offline.

### Testar PWA localmente

1. Build de produção: `npm run build`
2. Servir com HTTPS (necessário para Service Worker): `npm run preview` (ou use um túnel como `npx serve dist -s` e ngrok)
3. No Chrome: DevTools → Application → Manifest (ver manifest e ícones) e Service Workers (ver registro)
4. Simular offline: Application → Service Workers → Offline

### Validar com Lighthouse

1. Abra o app em produção (ou preview) em uma aba anônima
2. DevTools → Lighthouse → categoria **Progressive Web App**
3. Rode a auditoria e confira: instalável, offline, manifest e ícones

### Comportamento

- **Instalação**: Em Configurações aparece "Instalar app" quando o navegador dispara `beforeinstallprompt` (Chrome/Android). No iOS, é mostrada a dica "Adicionar à Tela de Início" (Safari).
- **Atualização**: Quando houver nova versão, um banner "Atualização disponível" com botão "Recarregar" é exibido (após confirmação o app recarrega com a nova versão).
- **Offline**: Navegação sem rede mostra a página `/offline` (fallback). Assets do build são cacheados pelo Service Worker.

## Deploy

Faça deploy do frontend via Vercel/Netlify e das Edge Functions via Supabase CLI. Para PWA, sirva o app via **HTTPS**.
