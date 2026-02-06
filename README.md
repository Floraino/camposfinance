# CamposFinance

App de finanças por família com IA integrada (Google Gemini).

## Tecnologias

- **Frontend**: Vite + React + TypeScript + Tailwind CSS + shadcn-ui
- **Backend**: Supabase (Auth, Database, Edge Functions)
- **IA**: Google Gemini API (OCR, categorização, análise CSV, chat)

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
| `GEMINI_API_KEY` | Chave da API Google Gemini (obter em https://aistudio.google.com/apikey) |
| `STRIPE_SECRET_KEY` | Chave secreta Stripe (pagamentos) |
| `STRIPE_WEBHOOK_SECRET` | Secret do webhook Stripe |

## Features com IA

- **OCR de recibos**: Upload de imagem → Gemini Vision → extração de dados
- **Importação CSV**: Parsing + Gemini para mapeamento de colunas inteligente
- **Categorização**: Keywords local + Gemini como fallback para descrições desconhecidas
- **Clara (chat)**: Assistente financeira com Gemini

## Testes

```sh
npm run test
```

## Deploy

Faça deploy do frontend via Vercel/Netlify e das Edge Functions via Supabase CLI.
