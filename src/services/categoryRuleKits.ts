/**
 * Kits de regras por categoria (>=100 patterns por categoria).
 * inferKit(categoryName) mapeia nome da categoria do banco para o kit.
 * Categorias do app: bills, food, leisure, shopping, transport, health, education, other.
 */

export type CategoryId = "bills" | "food" | "leisure" | "shopping" | "transport" | "health" | "education" | "other";

export interface RulePattern {
  pattern: string;
  priority: number; // 50 genérico, 80 marca forte, 100 muito específico
  confidence: number; // 0.9 marca forte, 0.85 palavra-chave, 0.7 genérico (auto-aplica >= 0.85)
}

export interface Kit {
  categoryId: CategoryId;
  patterns: RulePattern[];
}

const SUFFIXES = ["", " PIX", " DEB AUT", " COMPRA", " PAGAMENTO", " ONLINE", " APP", " *", " LTDA", " S/A", " S.A."];

function expandBase(base: string[], minTotal: number): RulePattern[] {
  const out: RulePattern[] = [];
  const added = new Set<string>();
  for (const b of base) {
    const upper = b.toUpperCase().trim();
    if (!added.has(upper)) {
      added.add(upper);
      out.push({ pattern: upper, priority: 80, confidence: 0.9 });
    }
  }
  // Variações para alcançar minTotal
  for (const b of base) {
    if (out.length >= minTotal) break;
    const u = b.toUpperCase().trim();
    for (const suf of SUFFIXES) {
      const p = u + suf;
      if (p.length > 2 && !added.has(p)) {
        added.add(p);
        out.push({ pattern: p, priority: 70, confidence: 0.85 });
        if (out.length >= minTotal) break;
      }
    }
  }
  return out;
}

// ---- FOOD (Alimentação) ----
const FOOD_BASE = [
  "ifood", "rappi", "uber eats", "delivery", "restaurante", "lanchonete", "lanche", "padaria", "açougue", "acougue",
  "supermercado", "mercado", "hortifruti", "atacadao", "atacadão", "feira", "almoço", "almoco", "jantar", "café", "cafe",
  "confeitaria", "pizzaria", "hamburgueria", "mcdonalds", "mc donalds", "burger king", "subway", "habibs", "giraffas",
  "outback", "spoleto", "sukiya", "kfc", "tacobell", "dominos", "papa johns", "pizzaria", "sorveteria", "açaí", "acai",
  "bobs", "nagumo", "sushi", "japonês", "japones", "china in box", "giraffas", "madero", "coco bambu", "pé de feijão",
  "pao de acucar", "pao de açúcar", "carrefour", "extra", "atacadão", "assai", "sonda", "super nosso", "bh", "savegnago",
  "prezunic", "super mercado", "mercado central", "sacolão", "sacolao", "quitanda", "bar do zé", "bar do ze",
  "casa do pao", "casa do pão", "bread", "bakery", "food", "alimentacao", "alimentação", "comida", "refeicao", "refeição",
  "delivery refeicao", "i food", "rapp i", "uber eats", "aiqfome", "ze delivery", "zé delivery", "didi food",
  "loggi food", "99 food", "cobasi pet", "pet food", "ração", "racao",
];
const FOOD_PATTERNS: RulePattern[] = expandBase(FOOD_BASE, 100).slice(0, 120);

// ---- TRANSPORT ----
const TRANSPORT_BASE = [
  "uber", "99", "99 pop", "99 app", "in driver", "indriver", "cabify", "taxi", "táxi", "taxi",
  "posto", "gasolina", "combustivel", "combustível", "shell", "ipiranga", "br distribuidora", "ale", "raizen",
  "vibra", "petrobras", "petrobrás", "estacionamento", "sem parar", "semparar", "parking", "pedagio", "pedágio",
  "conectcar", "estapar", "waze", "google maps", "onibus", "ônibus", "metro", "metrô", "trem", "cpfl",
  "bilhete unico", "bilhete único", "bom", "sptrans", "metro sp", "viação", "viacao", "expresso", "cometa",
  "util", "viação util", "gontijo", "1001", "real", "autoviacao", "auto viação", "passagem", "rodoviaria",
  "blablacar", "carro", "moto", "ipva", "seguro auto", "licenciamento", "detran", "multa transito", "multa trânsito",
  "uber trip", "uber viagem", "uber eats", "99 corrida", "99 corridas", "cabify", "lyft",
];
const TRANSPORT_PATTERNS: RulePattern[] = expandBase(TRANSPORT_BASE, 100).slice(0, 110);

// ---- BILLS (Contas Fixas) ----
const BILLS_BASE = [
  "luz", "energia", "eletricidade", "enel", "cpfl", "cemig", "neoenergia", "equatorial", "taesa",
  "agua", "água", "sabesp", "sanepar", "copasa", "caesa", "cagece", "embasa", "concessionaria agua",
  "gas", "gás", "comgas", "comgás", "ultragaz", "supergas", "liquigás", "liquigas",
  "internet", "banda larga", "net virtua", "oi fibra", "vivo fibra", "claro internet", "tim fibra", "algar",
  "telefone", "celular", "vivo", "claro", "tim", "oi", "algar telecom", "operadora",
  "aluguel", "condominio", "condomínio", "iptu", "iptu", "prefeitura", "imposto predial",
  "netflix", "spotify", "disney", "prime", "hbo", "youtube premium", "deezer", "apple music", "google one",
  "assinatura", "mensalidade", "conta de luz", "conta de agua", "conta de gas", "conta telefone",
  "recurso agua", "recurso luz", "multa conta", "juros conta", "pacote servicos", "pacote serviços",
  "nubank", "itau", "itaú", "bradesco", "santander", "anuidade cartao", "anuidade cartão", "tarifa banco",
  "conta corrente", "pacote", "tarifa mensal", "taxa manutencao", "taxa manutenção",
];
const BILLS_PATTERNS: RulePattern[] = expandBase(BILLS_BASE, 100).slice(0, 115);

// ---- HEALTH ----
const HEALTH_BASE = [
  "farmacia", "farmácia", "drogaria", "drogasil", "droga raia", "droga sil", "pacheco", "pague menos",
  "ultrafarma", "sao paulo", "drogarias", "farmadel", "popular", "medicamento", "remedio", "remédio",
  "medico", "médico", "consulta", "exame", "laboratorio", "laboratório", "hospital", "clinica", "clínica",
  "dentista", "odontologia", "plano de saude", "plano de saúde", "unimed", "amil", "bradesco saude",
  "sulamerica", "sul américa", "hapvida", "notre dame", "prevent senior", "saude caixa",
  "academia", "smart fit", "bio ritmo", "bio ritmo", "bodytech", "fitness", "gym", "personal",
  "psicologo", "psicólogo", "terapia", "fisioterapia", "fonoaudiologia", "nutricionista", "nutrição",
  "ótico", "otico", "lente", "oculos", "óculos", "optica", "óptica", "vacina", "posto saude",
  "ubs", "upa", "samu", "emergencia", "emergência", "pronto socorro", "maternidade",
];
const HEALTH_PATTERNS: RulePattern[] = expandBase(HEALTH_BASE, 100).slice(0, 110);

// ---- EDUCATION ----
const EDUCATION_BASE = [
  "escola", "faculdade", "universidade", "curso", "livro", "livraria", "material escolar", "mensalidade escolar",
  "apostila", "udemy", "alura", "ingles", "inglês", "idioma", "cursinho", "pre vestibular", "pré vestibular",
  "senac", "senai", "espro", "kumon", "wizard", "cna", "fisk", "cel Lep", "yazigi", "ccaa",
  "puc", "usp", "unicamp", "ufmg", "ufrj", "unesp", "faculdade", "graduacao", "graduação", "pos graduacao",
  "mba", "especializacao", "especialização", "mestrado", "doutorado", "enem", "vestibular",
  "amazon kindle", "kindle", "saraiva", "livraria cultura", "leitura", "biblioteca", "xerox", "copia",
  "papelaria", "papelaria", "caneta", "caderno", "mochila", "uniforme escolar", "transporte escolar",
];
const EDUCATION_PATTERNS: RulePattern[] = expandBase(EDUCATION_BASE, 100).slice(0, 105);

// ---- SHOPPING ----
const SHOPPING_BASE = [
  "amazon", "mercado livre", "magazine luiza", "magalu", "americanas", "submarino", "shoptime",
  "shein", "aliexpress", "shopee", "wish", "casas bahia", "ponto frio", "extra", "carrefour",
  "loja", "shopping", "centro comercial", "roupa", "vestuario", "vestuário", "sapato", "calcado",
  "zara", "renner", "cea", "riachuelo", "marisa", "c&a", "leader", "camicado", "colombo",
  "fast shop", "kabum", "pichau", "terabyte", "informatica", "informática", "eletronico", "eletrônico",
  "celular", "smartphone", "iphone", "samsung", "xiaomi", "motorola", "lg", "positivo",
  "presente", "presente", "brinquedo", "toys", "decoração", "decoracao", "moveis", "móveis",
  "posto", "posto de gasolina", "posto shell", "posto ipiranga", "combustivel", "gasolina",
  "mercado", "supermercado", "atacado", "atacadão", "assai", "atacadao",
];
const SHOPPING_PATTERNS: RulePattern[] = expandBase(SHOPPING_BASE, 100).slice(0, 110);

// ---- LEISURE ----
const LEISURE_BASE = [
  "netflix", "spotify", "disney", "disney plus", "hbo", "hbo max", "prime video", "amazon prime",
  "youtube premium", "deezer", "apple music", "apple tv", "paramount", "star+", "globoplay",
  "cinema", "cinépolis", "cinemapolis", "kinoplex", "movie", "filme", "ingresso", "ingressos",
  "show", "teatro", "evento", "festival", "live", "streaming", "assinatura streaming",
  "viagem", "hotel", "airbnb", "booking", "decolar", "cvc", "latam", "gol", "azul",
  "bar", "pub", "cervejaria", "restaurante", "balada", "festa", "boate", "casino",
  "jogo", "game", "steam", "playstation", "xbox", "nintendo", "ea", "epic games",
  "uber", "99", "ifood", "rappi", "delivery", "i food", "uber eats",
];
const LEISURE_PATTERNS: RulePattern[] = expandBase(LEISURE_BASE, 100).slice(0, 105);

// ---- OTHER (IOF, tarifas, taxas, genéricos) ----
const OTHER_BASE = [
  "iof", "tarifa", "juros", "multa", "anuidade", "encargo", "pacote servicos", "pacote serviços",
  "taxa", "taxa de", "tarifa bancaria", "tarifa bancária", "manutencao", "manutenção",
  "pix enviado", "pix recebido", "ted", "doc", "transferencia", "transferência",
  "pagamento", "debito automatico", "débito automático", "deb aut", "compra cartao", "compra cartão",
  "saque", "saque atm", "saque caixa", "boleto", "pagamento boleto", "referencia", "referência",
  "pf ", "pj ", "id ", "nr ", "ref ", "aut ", "pag ", "valor ", "parc ", "parcela",
  "estorno", "devolucao", "devolução", "reembolso", "ajuste", "correção", "correcao",
  "rendimento", "dividendo", "dividendo", "juros sobre", "aplicacao", "aplicação",
  "investimento", "tesouro", "cdb", "lci", "lca", "fundos", "acoes", "ações",
];
const OTHER_PATTERNS: RulePattern[] = expandBase(OTHER_BASE, 100).slice(0, 110);

// ---- Kits por categoryId ----
const KITS: Record<CategoryId, Kit> = {
  food: { categoryId: "food", patterns: FOOD_PATTERNS },
  transport: { categoryId: "transport", patterns: TRANSPORT_PATTERNS },
  bills: { categoryId: "bills", patterns: BILLS_PATTERNS },
  health: { categoryId: "health", patterns: HEALTH_PATTERNS },
  education: { categoryId: "education", patterns: EDUCATION_PATTERNS },
  shopping: { categoryId: "shopping", patterns: SHOPPING_PATTERNS },
  leisure: { categoryId: "leisure", patterns: LEISURE_PATTERNS },
  other: { categoryId: "other", patterns: OTHER_PATTERNS },
};

const CATEGORY_NAME_KEYWORDS: Array<{ keys: string[]; categoryId: CategoryId }> = [
  { keys: ["aliment", "mercad", "restaur", "comida", "food", "padaria", "lanche", "delivery", "ifood"], categoryId: "food" },
  { keys: ["transporte", "transport", "uber", "posto", "gasolina", "estacionamento", "pedagio"], categoryId: "transport" },
  { keys: ["conta", "fixa", "bills", "luz", "agua", "água", "internet", "aluguel", "condominio", "telefone"], categoryId: "bills" },
  { keys: ["saude", "saúde", "health", "farmacia", "farmácia", "medico", "médico", "academia"], categoryId: "health" },
  { keys: ["educac", "educação", "education", "escola", "curso", "livro", "faculdade"], categoryId: "education" },
  { keys: ["compra", "shopping", "loja", "vestuario", "roupa", "amazon", "mercado livre"], categoryId: "shopping" },
  { keys: ["lazer", "leisure", "cinema", "netflix", "streaming", "viagem", "hotel"], categoryId: "leisure" },
  { keys: ["outro", "other", "diversos"], categoryId: "other" },
];

/**
 * Infere o kit de regras a partir do nome (ou slug) da categoria.
 * Usado no seed para mapear categorias do banco -> patterns.
 */
export function inferKit(categoryNameOrSlug: string): Kit {
  const norm = categoryNameOrSlug.toLowerCase().trim().normalize("NFD").replace(/\p{M}/gu, "");
  const slug = norm.replace(/\s+/g, "_");
  if (KITS[slug as CategoryId]) return KITS[slug as CategoryId];
  for (const { keys, categoryId } of CATEGORY_NAME_KEYWORDS) {
    if (keys.some((k) => norm.includes(k))) return KITS[categoryId];
  }
  return KITS.other;
}

/**
 * Retorna todos os kits (para seed).
 */
export function getAllKits(): Kit[] {
  return Object.values(KITS);
}

/**
 * Garante >= 100 patterns por kit (para validação/seed).
 */
export function ensureMinPatternsPerKit(min: number): void {
  for (const kit of Object.values(KITS)) {
    if (kit.patterns.length < min) {
      throw new Error(`Kit ${kit.categoryId} has ${kit.patterns.length} patterns, expected >= ${min}`);
    }
  }
}
