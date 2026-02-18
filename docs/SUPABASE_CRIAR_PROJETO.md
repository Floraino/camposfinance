# Criar seu próprio projeto Supabase (passo a passo)

O app usa variáveis no `.env` que devem apontar para o **seu** projeto Supabase:

---

## 1. Criar conta no Supabase (se ainda não tiver)

1. Acesse **https://supabase.com**
2. Clique em **Start your project**
3. Faça login com **GitHub** ou **email**

---

## 2. Criar um novo projeto

1. No dashboard, clique em **New Project**
2. Escolha a **Organization** (ou crie uma)
3. Preencha:
   - **Name:** ex: `camposfinance`
   - **Database Password:** crie uma senha **forte** e **guarde** (você usa para acessar o banco e para a CLI)
   - **Region:** escolha a mais próxima (ex: South America (São Paulo))
4. Clique em **Create new project**
5. Espere alguns minutos até o projeto ficar verde (Ready)

---

## 3. Pegar a URL e a chave (anon key)

1. No menu lateral, vá em **Project Settings** (ícone de engrenagem)
2. Clique em **API** no submenu
3. Na seção **Project URL**, copie a **URL** (ex: `https://xxxxx.supabase.co`)
4. Na seção **Project API keys**, copie a chave **anon** **public** (não use a `service_role` no frontend)

---

## 4. Configurar o projeto no seu PC

1. Abra a pasta do projeto no Cursor
2. Abra o arquivo **`.env`** na raiz (em `camposfinance`)
3. Substitua pelos valores do **seu** projeto:

```env
VITE_SUPABASE_PROJECT_ID="SEU_PROJECT_REF"
VITE_SUPABASE_PUBLISHABLE_KEY="sua_anon_key_aqui"
VITE_SUPABASE_URL="https://SEU_PROJECT_REF.supabase.co"
```

- **SEU_PROJECT_REF:** é o ID do projeto. Aparece na URL do dashboard:  
  `https://supabase.com/dashboard/project/SEU_PROJECT_REF`  
  Ou em **Project Settings → General → Reference ID**.
- **sua_anon_key_aqui:** a chave **anon public** que você copiou no passo 3.
- **VITE_SUPABASE_URL:** a **Project URL** que você copiou no passo 3.

4. Salve o `.env`

---

## 5. Criar as tabelas e funções no banco (migrations)

O banco novo começa **vazio**. É preciso rodar as migrations para criar tabelas, RLS e funções.

### Opção A – Pelo SQL Editor (sem CLI)

1. No Supabase Dashboard, vá em **SQL Editor**
2. As migrations estão em `supabase/migrations/` **em ordem de nome** (pela data no nome do arquivo)
3. Abra cada arquivo **nessa ordem** no Cursor, copie todo o conteúdo, cole no SQL Editor e clique em **Run**:
   - `20260203162706_...sql`
   - `20260203174304_...sql`
   - `20260203181049_...sql`
   - … e assim por diante até o último (incluindo `20260206180000_admin_users_rpc.sql`)

Se der erro em alguma (por exemplo “relation already exists”), anote e siga para a próxima; às vezes uma migration depende da anterior.

### Opção B – Pela CLI (recomendado se conseguir usar)

1. No terminal (CMD ou PowerShell com política de execução ajustada):
   ```bash
   cd C:\Users\pedro1\Documents\cursor\camposfinance
   npx supabase link --project-ref SEU_PROJECT_REF
   ```
   Quando pedir, use a **senha do banco** que você definiu ao criar o projeto.

2. Depois:
   ```bash
   npx supabase db push
   ```
   Isso aplica todas as migrations de uma vez.

   Ou use o script do projeto:
   ```bash
   npm run db:push
   ```

### Opção C – Migrations automáticas (GitHub Actions)

Sempre que houver **novas migrations** em `supabase/migrations/` e você der **push na branch `main`**, o workflow aplica as migrations no banco remoto.

**Configuração (uma vez):** no repositório, vá em **Settings → Secrets and variables → Actions** e crie:

| Secret | Descrição |
|--------|-----------|
| `SUPABASE_ACCESS_TOKEN` | Token em https://supabase.com/dashboard/account/tokens |
| `SUPABASE_DB_PASSWORD` | Senha do banco do projeto |
| `SUPABASE_PROJECT_REF` | (opcional) ID do projeto; se não definir, usa o `project_id` do `supabase/config.toml` |

O workflow está em `.github/workflows/supabase-migrate.yml`. Você também pode rodar manualmente em **Actions → Supabase migrations → Run workflow**.

---

## 6. Configurar Auth (login)

1. No dashboard, vá em **Authentication → Providers**
2. Habilite **Email** (e, se quiser, **Google** ou outros)
3. Em **Authentication → URL Configuration**, em **Site URL**, coloque:
   - Desenvolvimento: `http://localhost:5173` (ou a porta que o Vite usar)
   - Produção: a URL do seu app (ex: Vercel, Netlify, etc.)

Assim o login e os redirects funcionam no seu projeto.

---

## 7. Criar seu primeiro usuário e (opcional) super admin

1. Rode o app (`npm run dev`), acesse a tela de cadastro/login e **crie uma conta** com email e senha.
2. Esse usuário será criado em **Authentication → Users** no Supabase.
3. Para virar **super admin** (acessar o Painel Admin):
   - No Supabase, vá em **SQL Editor**
   - Rode (trocando `SEU_USER_ID` pelo UUID do usuário que aparece em Authentication → Users):

   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('SEU_USER_ID', 'super_admin')
   ON CONFLICT (user_id, role) DO NOTHING;
   ```

---

## Resumo rápido

| Onde              | O que fazer |
|-------------------|------------|
| supabase.com      | Criar conta → New Project → guardar senha do banco |
| Project Settings → API | Copiar URL e anon key |
| `.env` no projeto | Colocar `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` |
| SQL Editor ou CLI | Rodar todas as migrations em ordem |
| Authentication    | Habilitar Email (e Site URL) |
| App               | Criar conta no app → opcional: dar role super_admin no SQL |

Depois disso, o app passa a usar **seu** projeto Supabase.
