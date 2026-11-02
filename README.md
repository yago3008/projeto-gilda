# GILDA; · Gestão de peças e custos

Sistema web para a loja **GILDA;** (mundogilda.com.br) cadastrar cada peça, detalhar a composição de custo (tecido, botões, zíperes, etiquetas, aviamentos, mão de obra, embalagem, sacola…) e chegar automaticamente ao custo final e à margem de cada produto. Inclui painel com resumo, controle de estoque com histórico, exportação para CSV/Excel e cadastros totalmente modulares.

Backend em **Python (FastAPI + SQLAlchemy + SQLite)**, frontend em HTML/CSS/JS puro com a identidade visual do site da marca, tudo empacotado em um container Docker chamado **projeto-gilda**.

## Como rodar

Pré-requisito: Docker Desktop instalado.

```bash
cp .env.example .env        # ajuste usuário, senha e chave se quiser
docker compose up -d --build
```

Abra http://localhost:11111 e entre com o usuário e senha do `.env` (padrão `gilda` / `gilda123`).

Comandos úteis:

```bash
docker compose logs -f          # acompanhar os logs
docker compose down             # parar (os dados ficam no volume projeto-gilda-dados)
docker compose down -v          # parar e apagar os dados
```

Sem Docker, para desenvolver:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Variáveis de ambiente (`.env`)

| Variável | Padrão | Para quê |
|---|---|---|
| `GILDA_USER` / `GILDA_PASSWORD` | `gilda` / `gilda123` | login do sistema |
| `GILDA_SECRET_KEY` | (aleatória) | assina o cookie de sessão; defina uma fixa para não deslogar a cada reinício |
| `GILDA_SEED_EXEMPLO` | `1` | `1` cria peças e insumos de exemplo na primeira execução com banco vazio; `0` começa vazio |
| `GILDA_PORT` | `11111` | porta exposta no computador |
| `DATABASE_URL` | SQLite em `/data/gilda.db` | troque por PostgreSQL se um dia precisar |

## O que o sistema faz

**Peças.** Cadastro com nome, código/SKU, coleção ou capítulo, categoria, tamanho, cor, quantidade em estoque, estoque mínimo (gera alerta), preço de venda, descrição e quantos campos extras as donas quiserem criar. O custo de produção não é digitado: ele nasce da composição.

**Composição de custo.** Cada linha tem grupo (tecido, botões, mão de obra…), insumo do catálogo (opcional), descrição, unidade, quantidade e valor unitário. Quantidade × valor unitário dá o total do item, e a soma dos itens é o custo final da peça, com resumo por grupo e margem sobre o preço de venda calculados na hora. Escolher um insumo do catálogo preenche descrição, unidade e valor automaticamente. Uma peça pode ser duplicada para criar variações de tamanho e cor com a mesma composição.

**Insumos.** Catálogo com valor unitário padrão e fornecedor. Ao editar o preço de um insumo dá para atualizar de uma vez todas as composições que o usam.

**Estoque.** Entradas, saídas e ajustes com motivo, observação e histórico, além do estoque resultante em cada movimento.

**Painel.** Peças cadastradas, unidades em estoque, valor do estoque a custo e a preço de venda, lucro potencial, margem média, custo por grupo, unidades por categoria e coleção, peças com estoque baixo, melhores e piores margens e últimas movimentações.

**Cadastros (a parte modular).** Coleções/capítulos, categorias de peça, grupos de custo, listas de tamanhos, cores, unidades e motivos, e campos personalizados (texto, número, lista, sim/não, data) que aparecem automaticamente no formulário da peça.

**Exportação.** Peças, composição de custos e insumos em CSV (separador `;`, pronto para o Excel brasileiro) e uma planilha Excel completa com três abas.

## API

A documentação interativa fica em http://localhost:11111/docs (precisa estar logado). Principais rotas:

```
POST /api/login · POST /api/logout · GET /api/me
GET|POST /api/produtos · GET|PUT|DELETE /api/produtos/{id} · POST /api/produtos/{id}/duplicar
GET|PUT|POST /api/produtos/{id}/custos · DELETE /api/produtos/{id}/custos/{item_id}
GET|POST /api/insumos · GET|PUT|DELETE /api/insumos/{id}
GET /api/estoque/movimentacoes · POST /api/estoque/produtos/{id}/movimentar
GET|POST|PUT|DELETE /api/colecoes, /api/categorias, /api/categorias-insumo, /api/opcoes, /api/campos
GET /api/dashboard
GET /api/exportar/produtos.csv · /api/exportar/custos.csv · /api/exportar/insumos.csv · /api/exportar/completo.xlsx
```

## Estrutura

```
projeto-gilda/
├── Dockerfile · docker-compose.yml · requirements.txt · .env.example
└── app/
    ├── main.py          # FastAPI, login, rotas do frontend
    ├── database.py      # conexão (SQLite por padrão)
    ├── models.py        # tabelas
    ├── schemas.py       # validação de entrada/saída
    ├── auth.py          # login simples por variável de ambiente
    ├── seed.py          # cadastros base e dados de exemplo
    ├── routers/         # produtos, insumos, estoque, cadastros, dashboard, exportar
    └── static/          # index.html, login.html, app.js, styles.css
```

## Identidade visual

Tokens tirados do site da marca: mostarda `#AC8018`, terracota `#75230B`, oliva `#7C7455`, creme `#E9E9D4`, títulos em EB Garamond, corpo em sans leve (Nunito Sans no lugar de Madefor/Avenir), botões em pílula com borda fina e o ponto e vírgula como assinatura. As fontes vêm do Google Fonts e caem para Garamond/Georgia e a fonte do sistema quando não há internet.

## Próximos passos possíveis

Fotos das peças, múltiplos usuários com perfis, relatório de vendas por período e uma tela de precificação sugerida a partir de uma margem alvo.
