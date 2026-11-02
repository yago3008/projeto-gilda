# GILDA; · Gestão de peças e custos

Sistema web para a loja **GILDA;** (mundogilda.com.br) cadastrar cada peça, detalhar a composição de custo (tecido, botões, zíperes, etiquetas, aviamentos, mão de obra, embalagem, sacola…) e chegar automaticamente ao custo final e à margem de cada produto. Inclui painel com resumo, controle de estoque com histórico, exportação para CSV/Excel e cadastros totalmente modulares.

Versão **estática** (branch `estatico`): roda 100% no navegador, sem servidor nem banco. Publicada no GitHub Pages em https://yago3008.github.io/projeto-gilda/

A versão original, com backend Python (FastAPI + SQLite) em Docker, continua na branch `main`.

## Como funciona sem servidor

- O `db.js` reimplementa as rotas da antiga API em JavaScript e guarda tudo no `localStorage` do navegador. O `app.js` (a interface) é o mesmo da versão com servidor.
- **Os dados ficam no navegador de quem usa.** Cada computador ou navegador tem os seus, e limpar os dados do site apaga tudo. Use **Backup** (baixa um `.json`) e **Restaurar** no rodapé do menu para guardar ou levar os dados para outro lugar.
- Não há login: sem servidor não existe senha que proteja algo. Quem abre o link vê apenas os dados do próprio navegador.
- Na primeira visita o sistema já vem com os cadastros base e as peças de exemplo.
- A exportação para Excel carrega a biblioteca SheetJS da internet na hora do clique. Os CSVs são gerados localmente.

## Como rodar localmente

Qualquer servidor de arquivos estáticos serve, por exemplo:

```bash
python -m http.server 8000
```

e abra http://localhost:8000.

## O que o sistema faz

**Peças.** Cadastro com nome, código/SKU, coleção ou capítulo, categoria, tamanho, cor, quantidade em estoque, estoque mínimo (gera alerta), preço de venda, descrição e quantos campos extras as donas quiserem criar. O custo de produção não é digitado: ele nasce da composição.

**Composição de custo.** Cada linha tem grupo (tecido, botões, mão de obra…), insumo do catálogo (opcional), descrição, unidade, quantidade e valor unitário. Quantidade × valor unitário dá o total do item, e a soma dos itens é o custo final da peça, com resumo por grupo e margem sobre o preço de venda calculados na hora. Escolher um insumo do catálogo preenche descrição, unidade e valor automaticamente. Uma peça pode ser duplicada para criar variações de tamanho e cor com a mesma composição.

**Insumos.** Catálogo com valor unitário padrão e fornecedor. Ao editar o preço de um insumo dá para atualizar de uma vez todas as composições que o usam.

**Estoque.** Entradas, saídas e ajustes com motivo, observação e histórico, além do estoque resultante em cada movimento.

**Painel.** Peças cadastradas, unidades em estoque, valor do estoque a custo e a preço de venda, lucro potencial, margem média, custo por grupo, unidades por categoria e coleção, peças com estoque baixo, melhores e piores margens e últimas movimentações.

**Cadastros (a parte modular).** Coleções/capítulos, categorias de peça, grupos de custo, listas de tamanhos, cores, unidades e motivos, e campos personalizados (texto, número, lista, sim/não, data) que aparecem automaticamente no formulário da peça.

**Exportação.** Peças, composição de custos e insumos em CSV (separador `;`, pronto para o Excel brasileiro) e uma planilha Excel completa com três abas.

## Estrutura

```
projeto-gilda/  (branch estatico)
├── index.html   # casca da SPA
├── app.js       # interface (roteador por hash, telas, formulários)
├── db.js        # "backend" no navegador: rotas, regras, dados de exemplo, exportação, backup
├── styles.css · favicon.svg
└── .nojekyll
```

## Identidade visual

Tokens tirados do site da marca: mostarda `#AC8018`, terracota `#75230B`, oliva `#7C7455`, creme `#E9E9D4`, títulos em EB Garamond, corpo em sans leve (Nunito Sans no lugar de Madefor/Avenir), botões em pílula com borda fina e o ponto e vírgula como assinatura. As fontes vêm do Google Fonts e caem para Garamond/Georgia e a fonte do sistema quando não há internet.

## Próximos passos possíveis

Fotos das peças, múltiplos usuários com perfis, relatório de vendas por período e uma tela de precificação sugerida a partir de uma margem alvo.
