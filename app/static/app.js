/* ------------------------------------------------------------------
   GILDA; — frontend (SPA sem framework, roteador por hash)
   ------------------------------------------------------------------ */
'use strict';

// ---------- utilidades ----------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const conteudo = $('#conteudo');

const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v, d = 2) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d });
const fmtPct = (v) => (v === null || v === undefined ? '—' : `${fmtNum(v, 1)}%`);
const fmtData = (iso) => (iso ? new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

const CORES_MAPA = { 'off-white': '#f3efe4', creme: '#e9e2c9', terracota: '#b4522d', marrom: '#5a3a24', preto: '#1f1a16', mostarda: '#ac8018', oliva: '#7c7455', azul: '#3d5a80', branco: '#ffffff', bege: '#d9d3c2', vermelho: '#8b1e12', verde: '#4c6b3c', rosa: '#e7b8b0', cinza: '#9a9a9a' };
const bolinha = (cor) => { const c = CORES_MAPA[(cor || '').toLowerCase()]; return c ? `<span class="cor-bolinha" style="background:${c}"></span>` : ''; };

async function api(url, opts = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401) { location.href = '/login'; throw new Error('Sessão expirada'); }
  if (r.status === 204) return null;
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = typeof dados.detail === 'string' ? dados.detail : (dados.detail?.[0]?.msg || 'Erro inesperado');
    throw new Error(msg);
  }
  return dados;
}

function toast(msg, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function modal({ titulo, corpo, larga = false, aoAbrir }) {
  const raiz = $('#modal-raiz');
  raiz.innerHTML = `
    <div class="modal-fundo">
      <div class="modal ${larga ? 'larga' : ''}" role="dialog" aria-modal="true">
        <div class="modal-cabecalho"><h2>${titulo}</h2><button class="btn icone" data-fechar aria-label="Fechar">✕</button></div>
        <div class="modal-corpo">${corpo}</div>
      </div>
    </div>`;
  const fechar = () => { raiz.innerHTML = ''; document.removeEventListener('keydown', escHandler); };
  const escHandler = (e) => e.key === 'Escape' && fechar();
  document.addEventListener('keydown', escHandler);
  raiz.querySelector('[data-fechar]').onclick = fechar;
  raiz.querySelector('.modal-fundo').addEventListener('click', (e) => { if (e.target.classList.contains('modal-fundo')) fechar(); });
  const el = raiz.querySelector('.modal');
  if (aoAbrir) aoAbrir(el, fechar);
  const primeiro = el.querySelector('input, select, textarea');
  if (primeiro) primeiro.focus();
  return { el, fechar };
}

function confirmar(msg, { titulo = 'Confirmar', botao = 'Excluir' } = {}) {
  return new Promise((res) => {
    modal({
      titulo,
      corpo: `<p>${esc(msg)}</p><div class="form-rodape"><button class="btn suave" data-nao>Cancelar</button><button class="btn" data-sim>${botao}</button></div>`,
      aoAbrir(el, fechar) {
        el.querySelector('[data-nao]').onclick = () => { fechar(); res(false); };
        el.querySelector('[data-sim]').onclick = () => { fechar(); res(true); };
      },
    });
  });
}

// cache de cadastros auxiliares (recarregado quando algo muda)
const cache = { colecoes: [], categorias: [], opcoes: [], campos: [], grupos: [], insumos: [] };
async function carregarCadastros() {
  const [colecoes, categorias, opcoes, campos, grupos, insumos] = await Promise.all([
    api('/api/colecoes'), api('/api/categorias'), api('/api/opcoes'), api('/api/campos'), api('/api/categorias-insumo'), api('/api/insumos'),
  ]);
  Object.assign(cache, { colecoes, categorias, opcoes, campos, grupos, insumos });
}
const opcoesDe = (tipo) => cache.opcoes.filter((o) => o.tipo === tipo).map((o) => o.valor);
const options = (lista, valorAtual, { vazio = '—', chave = 'id', rotulo = 'nome' } = {}) =>
  `<option value="">${vazio}</option>` + lista.map((i) => {
    const v = typeof i === 'object' ? i[chave] : i; const r = typeof i === 'object' ? i[rotulo] : i;
    return `<option value="${esc(v)}" ${String(v) === String(valorAtual ?? '') ? 'selected' : ''}>${esc(r)}</option>`;
  }).join('');

function cabecalho(titulo, acoes = '', sub = '') {
  return `<div class="cabecalho"><div><div class="eyebrow">${sub}</div><h1>${titulo}<span class="pv">;</span></h1><div class="linha-mostarda"></div></div><div class="acoes">${acoes}</div></div>`;
}
const estoqueTag = (p) => p.quantidade_estoque === 0 ? '<span class="tag zero">esgotado</span>' : p.quantidade_estoque <= p.estoque_minimo ? '<span class="tag baixo">baixo</span>' : '<span class="tag ok">ok</span>';

// ---------- roteador ----------
const rotas = {};
function rota(nome, fn) { rotas[nome] = fn; }
async function navegar() {
  const hash = location.hash.replace(/^#\/?/, '').split('?')[0];
  const [nome, ...args] = hash.split('/');
  const fn = rotas[nome || 'painel'] || rotas.painel;
  $$('.nav a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === (nome || 'painel') || (nome === 'peca' && a.dataset.rota === 'pecas')));
  $('#nav').classList.remove('aberto');
  conteudo.innerHTML = '<div class="vazio">carregando…</div>';
  try { await fn(...args); } catch (e) { conteudo.innerHTML = `<div class="card"><h2>Ops</h2><p>${esc(e.message)}</p></div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', navegar);

// =====================================================================
// PAINEL
// =====================================================================
rota('painel', async () => {
  const d = await api('/api/dashboard');
  const maxCusto = Math.max(1, ...d.custo_por_categoria.map((c) => c.total_unitario));
  const maxCat = Math.max(1, ...d.pecas_por_categoria.map((c) => c.unidades));
  const maxCol = Math.max(1, ...d.pecas_por_colecao.map((c) => c.unidades));
  const barras = (lista, campo, max, cls = '', fmt = (v) => fmtNum(v, 0)) => lista.length
    ? `<div class="barras">${lista.map((i) => `<div class="barra ${cls}"><span class="nome" title="${esc(i.nome || i.categoria)}">${esc(i.nome || i.categoria)}</span><div class="trilho"><div class="preenchimento" style="width:${(i[campo] / max) * 100}%"></div></div><span class="num">${fmt(i[campo])}</span></div>`).join('')}</div>`
    : '<div class="vazio">sem dados ainda</div>';
  conteudo.innerHTML = `
    ${cabecalho('Painel', `<a class="btn contorno serifa" href="#/peca/nova">nova peça</a>`, 'Visão geral')}
    <div class="grid c6" style="margin-bottom:1.1rem">
      <div class="stat"><div class="rotulo">Peças cadastradas</div><div class="valor">${d.total_pecas}</div><div class="detalhe">${d.total_insumos} insumos no catálogo</div></div>
      <div class="stat"><div class="rotulo">Unidades em estoque</div><div class="valor">${fmtNum(d.unidades_estoque, 0)}</div><div class="detalhe">${d.estoque_baixo.length} peça(s) com estoque baixo</div></div>
      <div class="stat oliva"><div class="rotulo">Estoque a custo</div><div class="valor">${fmtBRL(d.valor_estoque_custo)}</div><div class="detalhe">investido nas peças em estoque</div></div>
      <div class="stat oliva"><div class="rotulo">Estoque a preço de venda</div><div class="valor">${fmtBRL(d.valor_estoque_venda)}</div><div class="detalhe">se tudo for vendido</div></div>
      <div class="stat terracota"><div class="rotulo">Lucro potencial</div><div class="valor">${fmtBRL(d.lucro_potencial)}</div><div class="detalhe">venda menos custo</div></div>
      <div class="stat terracota"><div class="rotulo">Margem média</div><div class="valor">${fmtPct(d.margem_media)}</div><div class="detalhe">sobre o preço de venda</div></div>
    </div>
    <div class="grid c3">
      <div class="card"><div class="card-titulo"><h3>Custo por grupo</h3><span class="small muted">por unidade, somando todas as peças</span></div>${barras(d.custo_por_categoria, 'total_unitario', maxCusto, '', fmtBRL)}</div>
      <div class="card"><div class="card-titulo"><h3>Unidades por categoria</h3></div>${barras(d.pecas_por_categoria, 'unidades', maxCat, 'oliva')}</div>
      <div class="card"><div class="card-titulo"><h3>Unidades por coleção</h3></div>${barras(d.pecas_por_colecao, 'unidades', maxCol, 'terracota')}</div>
      <div class="card"><div class="card-titulo"><h3>Estoque baixo</h3><a class="small" href="#/pecas?estoque_baixo=1">ver todas</a></div>
        ${d.estoque_baixo.length ? `<ul class="lista">${d.estoque_baixo.map((p) => `<li><a class="link-tabela" href="#/peca/${p.id}">${esc(p.nome)} <span class="muted">${esc(p.tamanho || '')} ${esc(p.cor || '')}</span></a><span>${p.quantidade_estoque === 0 ? '<span class="tag zero">esgotado</span>' : `<span class="tag baixo">${p.quantidade_estoque} un</span>`}</span></li>`).join('')}</ul>` : '<div class="vazio">tudo abastecido</div>'}
      </div>
      <div class="card"><div class="card-titulo"><h3>Melhores e piores margens</h3></div>
        ${d.melhores_margens.length ? `<div class="eyebrow" style="margin-bottom:.3rem">Melhores</div><ul class="lista">${d.melhores_margens.map((p) => `<li><a class="link-tabela" href="#/peca/${p.id}">${esc(p.nome)}</a><span class="tag ok">${fmtPct(p.margem_percentual)}</span></li>`).join('')}</ul>
        <div class="eyebrow" style="margin:.8rem 0 .3rem">Atenção</div><ul class="lista">${d.piores_margens.map((p) => `<li><a class="link-tabela" href="#/peca/${p.id}">${esc(p.nome)}</a><span class="tag ${p.margem_percentual < 30 ? 'baixo' : ''}">${fmtPct(p.margem_percentual)}</span></li>`).join('')}</ul>` : '<div class="vazio">cadastre preços para ver margens</div>'}
      </div>
      <div class="card"><div class="card-titulo"><h3>Últimas movimentações</h3><a class="small" href="#/estoque">histórico</a></div>
        ${d.ultimas_movimentacoes.length ? `<ul class="lista">${d.ultimas_movimentacoes.map((m) => `<li><span><span class="tag ${m.tipo === 'entrada' ? 'ok' : m.tipo === 'saida' ? 'baixo' : 'mostarda'}">${m.tipo}</span> ${esc(m.produto_nome)} <span class="muted small">${esc(m.motivo || '')}</span></span><span class="mono">${m.tipo === 'saida' ? '−' : m.tipo === 'entrada' ? '+' : '='}${m.quantidade}</span></li>`).join('')}</ul>` : '<div class="vazio">nenhuma movimentação</div>'}
        ${d.sem_composicao.length ? `<p class="small muted" style="margin-top:.8rem">Sem composição de custo: ${d.sem_composicao.map((p) => `<a href="#/peca/${p.id}">${esc(p.nome)}</a>`).join(', ')}</p>` : ''}
      </div>
    </div>`;
});

// =====================================================================
// PEÇAS (lista)
// =====================================================================
rota('pecas', async (query = '') => {
  await carregarCadastros();
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const estado = { q: params.get('q') || '', colecao_id: params.get('colecao_id') || '', categoria_id: params.get('categoria_id') || '', tamanho: params.get('tamanho') || '', cor: params.get('cor') || '', estoque_baixo: params.get('estoque_baixo') === '1', ordenar: 'nome', direcao: 'asc' };

  conteudo.innerHTML = `
    ${cabecalho('Peças', `
      <div class="acoes">
        <a class="btn suave" href="/api/exportar/produtos.csv">CSV</a>
        <a class="btn suave" href="/api/exportar/completo.xlsx">Excel</a>
        <a class="btn serifa" href="#/peca/nova">nova peça</a>
      </div>`, 'Catálogo')}
    <div class="filtros">
      <div class="campo busca"><label>Buscar</label><input type="search" id="f-q" placeholder="nome, código ou cor" value="${esc(estado.q)}"></div>
      <div class="campo"><label>Coleção</label><select id="f-colecao">${options(cache.colecoes, estado.colecao_id, { vazio: 'todas' })}</select></div>
      <div class="campo"><label>Categoria</label><select id="f-categoria">${options(cache.categorias, estado.categoria_id, { vazio: 'todas' })}</select></div>
      <div class="campo"><label>Tamanho</label><select id="f-tamanho">${options(opcoesDe('tamanho'), estado.tamanho, { vazio: 'todos' })}</select></div>
      <div class="campo"><label>Cor</label><select id="f-cor">${options(opcoesDe('cor'), estado.cor, { vazio: 'todas' })}</select></div>
      <label class="check" style="padding-bottom:.55rem"><input type="checkbox" id="f-baixo" ${estado.estoque_baixo ? 'checked' : ''}> estoque baixo</label>
    </div>
    <div class="card" style="padding:0"><div class="tabela-wrap" id="tabela"></div></div>`;

  async function render() {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(estado)) if (v !== '' && v !== false) qs.set(k, v === true ? 'true' : v);
    const lista = await api(`/api/produtos?${qs}`);
    const th = (rot, col, cls = '') => `<th class="${cls}" style="cursor:pointer" data-col="${col}">${rot} ${estado.ordenar === col ? (estado.direcao === 'asc' ? '↑' : '↓') : ''}</th>`;
    const totalEstoque = lista.reduce((s, p) => s + p.quantidade_estoque, 0);
    const totalCusto = lista.reduce((s, p) => s + p.quantidade_estoque * p.custo_producao, 0);
    const totalVenda = lista.reduce((s, p) => s + p.quantidade_estoque * p.preco_venda, 0);
    $('#tabela').innerHTML = lista.length ? `
      <table>
        <thead><tr>${th('Peça', 'nome')}${th('Código', 'codigo')}<th>Coleção</th><th>Categoria</th><th>Tam.</th><th>Cor</th>${th('Estoque', 'quantidade_estoque', 'num')}${th('Custo', 'custo_producao', 'num')}${th('Preço', 'preco_venda', 'num')}<th class="num">Margem</th><th></th></tr></thead>
        <tbody>${lista.map((p) => `
          <tr>
            <td><a class="link-tabela" href="#/peca/${p.id}">${esc(p.nome)}</a>${p.ativo ? '' : ' <span class="tag inativo">inativa</span>'}</td>
            <td class="muted small mono">${esc(p.codigo || '—')}</td>
            <td class="small">${esc(p.colecao_nome || '—')}</td>
            <td class="small">${esc(p.categoria_nome || '—')}</td>
            <td>${esc(p.tamanho || '—')}</td>
            <td>${bolinha(p.cor)}${esc(p.cor || '—')}</td>
            <td class="num">${p.quantidade_estoque} ${estoqueTag(p)}</td>
            <td class="num">${fmtBRL(p.custo_producao)}</td>
            <td class="num">${fmtBRL(p.preco_venda)}</td>
            <td class="num ${p.margem_percentual !== null && p.margem_percentual < 30 ? 'muted' : ''}">${fmtPct(p.margem_percentual)}</td>
            <td class="acoes">
              <button class="btn icone" title="Movimentar estoque" data-mov="${p.id}">⇅</button>
              <button class="btn icone" title="Duplicar" data-dup="${p.id}">⧉</button>
              <button class="btn icone" title="Excluir" data-del="${p.id}">🗑</button>
            </td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr class="total"><td colspan="6">${lista.length} peça(s)</td><td class="num">${totalEstoque}</td><td class="num">${fmtBRL(totalCusto)}</td><td class="num">${fmtBRL(totalVenda)}</td><td class="num">${totalVenda ? fmtPct((totalVenda - totalCusto) / totalVenda * 100) : '—'}</td><td></td></tr></tfoot>
      </table>` : '<div class="vazio">nenhuma peça encontrada</div>';
    $$('#tabela th[data-col]').forEach((el) => el.onclick = () => { const c = el.dataset.col; estado.direcao = estado.ordenar === c && estado.direcao === 'asc' ? 'desc' : 'asc'; estado.ordenar = c; render(); });
    $$('#tabela [data-mov]').forEach((b) => b.onclick = () => abrirMovimentacao(lista.find((p) => p.id == b.dataset.mov), render));
    $$('#tabela [data-dup]').forEach((b) => b.onclick = async () => { const n = await api(`/api/produtos/${b.dataset.dup}/duplicar`, { method: 'POST' }); toast('Peça duplicada'); location.hash = `#/peca/${n.id}`; });
    $$('#tabela [data-del]').forEach((b) => b.onclick = async () => {
      const p = lista.find((x) => x.id == b.dataset.del);
      if (await confirmar(`Excluir "${p.nome}" (${p.tamanho || ''} ${p.cor || ''})? A composição e o histórico de estoque também serão apagados.`)) { await api(`/api/produtos/${p.id}`, { method: 'DELETE' }); toast('Peça excluída'); render(); }
    });
  }
  let t;
  $('#f-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { estado.q = e.target.value.trim(); render(); }, 250); };
  [['f-colecao', 'colecao_id'], ['f-categoria', 'categoria_id'], ['f-tamanho', 'tamanho'], ['f-cor', 'cor']].forEach(([id, k]) => $(`#${id}`).onchange = (e) => { estado[k] = e.target.value; render(); });
  $('#f-baixo').onchange = (e) => { estado.estoque_baixo = e.target.checked; render(); };
  render();
});

function abrirMovimentacao(p, depois) {
  const motivos = opcoesDe('motivo');
  modal({
    titulo: `Movimentar estoque`,
    corpo: `
      <p class="muted">${esc(p.nome)} · ${esc(p.tamanho || '')} ${esc(p.cor || '')} · estoque atual <strong>${p.quantidade_estoque}</strong></p>
      <form id="f-mov" class="form-grid">
        <div class="campo col-4"><label>Tipo</label><select name="tipo"><option value="entrada">Entrada (+)</option><option value="saida">Saída (−)</option><option value="ajuste">Ajuste (define o total)</option></select></div>
        <div class="campo col-4"><label>Quantidade</label><input type="number" name="quantidade" min="0" step="1" value="1" required></div>
        <div class="campo col-4"><label>Motivo</label><input type="text" name="motivo" list="motivos" placeholder="venda, produção…"><datalist id="motivos">${motivos.map((m) => `<option value="${esc(m)}">`).join('')}</datalist></div>
        <div class="campo col-12"><label>Observação</label><input type="text" name="observacao"></div>
        <div class="form-rodape col-12"><button type="button" class="btn suave" data-fechar2>Cancelar</button><button class="btn" type="submit">Registrar</button></div>
      </form>`,
    aoAbrir(el, fechar) {
      el.querySelector('[data-fechar2]').onclick = fechar;
      el.querySelector('#f-mov').onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        try {
          const m = await api(`/api/estoque/produtos/${p.id}/movimentar`, { method: 'POST', body: { tipo: fd.tipo, quantidade: parseInt(fd.quantidade, 10) || 0, motivo: fd.motivo || null, observacao: fd.observacao || null } });
          toast(`Estoque de ${p.nome}: ${m.estoque_resultante} un`); fechar(); depois && depois();
        } catch (err) { toast(err.message, 'erro'); }
      };
    },
  });
}

// =====================================================================
// PEÇA (cadastro / edição com composição de custo)
// =====================================================================
rota('peca', async (id) => {
  await carregarCadastros();
  const nova = !id || id === 'nova';
  const p = nova
    ? { nome: '', codigo: '', colecao_id: '', categoria_id: '', tamanho: '', cor: '', quantidade_estoque: 0, estoque_minimo: 0, preco_venda: 0, descricao: '', campos_extras: {}, ativo: true, itens_custo: [] }
    : await api(`/api/produtos/${id}`);
  const itens = p.itens_custo.map((i) => ({ ...i }));
  const campos = cache.campos.filter((c) => c.ativo);

  const campoExtra = (c) => {
    const v = p.campos_extras?.[c.chave] ?? '';
    const req = c.obrigatorio ? 'required' : '';
    const lab = `<label>${esc(c.rotulo)} ${c.obrigatorio ? '<span class="obrig">*</span>' : ''}</label>`;
    if (c.tipo === 'lista') return `<div class="campo col-3">${lab}<select name="extra:${c.chave}" ${req}>${options(c.opcoes || [], v)}</select></div>`;
    if (c.tipo === 'numero') return `<div class="campo col-3">${lab}<input type="number" step="any" name="extra:${c.chave}" value="${esc(v)}" ${req}></div>`;
    if (c.tipo === 'booleano') return `<div class="campo col-3">${lab}<label class="check" style="padding-top:.45rem"><input type="checkbox" name="extra:${c.chave}" ${v ? 'checked' : ''}> sim</label></div>`;
    if (c.tipo === 'data') return `<div class="campo col-3">${lab}<input type="date" name="extra:${c.chave}" value="${esc(v)}" ${req}></div>`;
    return `<div class="campo col-3">${lab}<input type="text" name="extra:${c.chave}" value="${esc(v)}" ${req}></div>`;
  };

  conteudo.innerHTML = `
    ${cabecalho(nova ? 'Nova peça' : esc(p.nome), `
      <a class="btn suave" href="#/pecas">voltar</a>
      ${nova ? '' : `<button class="btn suave" id="b-mov">movimentar estoque</button><button class="btn suave" id="b-dup">duplicar</button>`}
      <button class="btn serifa" id="b-salvar">salvar</button>`, nova ? 'Cadastro' : `${esc(p.codigo || 'sem código')} · ${esc(p.colecao_nome || 'sem coleção')}`)}
    <form id="f-peca">
      <div class="grid c2" style="align-items:start">
        <div class="card span2">
          <div class="card-titulo"><h3>Dados da peça</h3><span class="small muted">campos com * são obrigatórios</span></div>
          <div class="form-grid">
            <div class="campo col-6"><label>Nome da peça <span class="obrig">*</span></label><input type="text" name="nome" value="${esc(p.nome)}" required placeholder="ex.: Camisa Grão"></div>
            <div class="campo col-3"><label>Código / SKU</label><input type="text" name="codigo" value="${esc(p.codigo || '')}" placeholder="ex.: CAM-GRAO-OW-M"></div>
            <div class="campo col-3"><label>Situação</label><label class="check" style="padding-top:.45rem"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> peça ativa</label></div>
            <div class="campo col-3"><label>Coleção / capítulo</label><select name="colecao_id">${options(cache.colecoes, p.colecao_id)}</select></div>
            <div class="campo col-3"><label>Categoria</label><select name="categoria_id">${options(cache.categorias, p.categoria_id)}</select></div>
            <div class="campo col-3"><label>Tamanho</label><input type="text" name="tamanho" list="l-tamanhos" value="${esc(p.tamanho || '')}"><datalist id="l-tamanhos">${opcoesDe('tamanho').map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
            <div class="campo col-3"><label>Cor</label><input type="text" name="cor" list="l-cores" value="${esc(p.cor || '')}"><datalist id="l-cores">${opcoesDe('cor').map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
            <div class="campo col-3"><label>Quantidade em estoque</label><input type="number" name="quantidade_estoque" min="0" step="1" value="${p.quantidade_estoque}"></div>
            <div class="campo col-3"><label>Estoque mínimo (alerta)</label><input type="number" name="estoque_minimo" min="0" step="1" value="${p.estoque_minimo}"></div>
            <div class="campo col-3"><label>Preço de venda (R$)</label><input type="number" name="preco_venda" min="0" step="0.01" value="${p.preco_venda}"></div>
            <div class="campo col-3"><label>Custo de produção (R$)</label><input type="text" value="${fmtBRL(p.custo_producao || 0)}" disabled id="custo-cache" title="Calculado automaticamente pela composição"><span class="ajuda">calculado pela composição abaixo</span></div>
            ${campos.map(campoExtra).join('')}
            <div class="campo col-12"><label>Descrição / observações</label><textarea name="descricao">${esc(p.descricao || '')}</textarea></div>
          </div>
          ${campos.length ? '' : '<p class="ajuda" style="margin-top:.8rem">Precisa de mais campos (ex.: composição do tecido, modelagem)? Crie em <a href="#/cadastros/campos">Cadastros › Campos personalizados</a>.</p>'}
        </div>

        <div class="card span2 composicao">
          <div class="card-titulo"><h3>Composição de custo</h3><span class="small muted">quantidade × valor unitário = total de cada item; a soma é o custo final da peça</span></div>
          <div class="tabela-wrap">
            <table>
              <thead><tr><th style="width:150px">Grupo</th><th style="width:220px">Insumo do catálogo</th><th>Descrição</th><th style="width:80px">Un.</th><th style="width:100px" class="num">Qtd.</th><th style="width:120px" class="num">Valor unit. (R$)</th><th style="width:110px" class="num">Total</th><th style="width:40px"></th></tr></thead>
              <tbody id="itens"></tbody>
            </table>
          </div>
          <div style="display:flex;gap:.5rem;margin-top:.8rem;flex-wrap:wrap">
            <button type="button" class="btn suave mini" id="b-add">+ adicionar item</button>
            <button type="button" class="btn suave mini" id="b-add-grupo">+ adicionar um item por grupo</button>
            <a class="small" href="#/insumos" style="align-self:center;margin-left:auto">gerenciar catálogo de insumos</a>
          </div>
          <hr style="border:none;border-top:1px solid var(--areia);margin:1.2rem 0">
          <div class="resumo-custo">
            <div id="resumo-grupos" class="barras"></div>
            <div class="margem-box">
              <div class="rotulo">Custo final da peça</div>
              <div class="total-grande" id="total-custo">R$ 0,00</div>
              <div class="small muted" id="margem-info" style="margin-top:.4rem"></div>
            </div>
          </div>
        </div>
      </div>
    </form>`;

  const tbody = $('#itens');
  const grupos = cache.grupos;
  const insumosAtivos = cache.insumos.filter((i) => i.ativo);

  function linhaHtml(it, idx) {
    return `
      <tr data-idx="${idx}">
        <td><select data-k="categoria_insumo_id">${options(grupos, it.categoria_insumo_id, { vazio: '—' })}</select></td>
        <td><select data-k="insumo_id"><option value="">(manual)</option>${insumosAtivos.map((i) => `<option value="${i.id}" ${it.insumo_id == i.id ? 'selected' : ''}>${esc(i.nome)}</option>`).join('')}</select></td>
        <td><input type="text" data-k="descricao" value="${esc(it.descricao || '')}" placeholder="ex.: tecido linho, costura, sacola…" required></td>
        <td><input type="text" data-k="unidade" list="l-unidades" value="${esc(it.unidade || 'un')}"></td>
        <td><input type="number" data-k="quantidade" step="any" min="0" value="${it.quantidade ?? 1}"></td>
        <td><input type="number" data-k="valor_unitario" step="0.01" min="0" value="${it.valor_unitario ?? 0}"></td>
        <td class="num total-celula">${fmtBRL((it.quantidade || 0) * (it.valor_unitario || 0))}</td>
        <td><button type="button" class="btn icone" data-rm title="Remover">✕</button></td>
      </tr>`;
  }
  function renderItens() {
    tbody.innerHTML = itens.map(linhaHtml).join('') + `<datalist id="l-unidades">${opcoesDe('unidade').map((u) => `<option value="${esc(u)}">`).join('')}</datalist>`;
    if (!itens.length) tbody.innerHTML += '<tr><td colspan="8" class="vazio">nenhum item ainda. Adicione tecido, aviamentos, mão de obra, embalagem…</td></tr>';
    atualizarTotais();
  }
  function atualizarTotais() {
    let total = 0; const porGrupo = {};
    itens.forEach((it, idx) => {
      it.valor_total = Math.round((num(it.quantidade) * num(it.valor_unitario)) * 100) / 100;
      total += it.valor_total;
      const g = grupos.find((x) => x.id == it.categoria_insumo_id)?.nome || 'Sem grupo';
      porGrupo[g] = (porGrupo[g] || 0) + it.valor_total;
      const cel = tbody.querySelector(`tr[data-idx="${idx}"] .total-celula`); if (cel) cel.textContent = fmtBRL(it.valor_total);
    });
    $('#total-custo').textContent = fmtBRL(total);
    $('#custo-cache').value = fmtBRL(total);
    const preco = num($('[name=preco_venda]').value);
    $('#margem-info').innerHTML = preco ? `preço de venda ${fmtBRL(preco)} · margem <strong>${fmtBRL(preco - total)}</strong> (${fmtPct((preco - total) / preco * 100)})${total / preco > 0.7 ? ' <span class="tag baixo">margem apertada</span>' : ''}` : 'informe o preço de venda para ver a margem';
    const max = Math.max(1, ...Object.values(porGrupo));
    $('#resumo-grupos').innerHTML = Object.entries(porGrupo).sort((a, b) => b[1] - a[1]).map(([g, v]) => `<div class="barra"><span class="nome">${esc(g)}</span><div class="trilho"><div class="preenchimento" style="width:${(v / max) * 100}%"></div></div><span class="num">${fmtBRL(v)} · ${total ? fmtPct(v / total * 100) : ''}</span></div>`).join('') || '<span class="small muted">o resumo por grupo aparece aqui</span>';
  }
  tbody.addEventListener('input', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const it = itens[tr.dataset.idx]; const k = e.target.dataset.k;
    if (k === 'insumo_id') {
      const ins = insumosAtivos.find((i) => i.id == e.target.value);
      it.insumo_id = ins ? ins.id : null;
      if (ins) {
        it.descricao = ins.nome; it.unidade = ins.unidade; it.valor_unitario = ins.custo_unitario; it.categoria_insumo_id = ins.categoria_id;
        tr.querySelector('[data-k=descricao]').value = ins.nome; tr.querySelector('[data-k=unidade]').value = ins.unidade;
        tr.querySelector('[data-k=valor_unitario]').value = ins.custo_unitario; tr.querySelector('[data-k=categoria_insumo_id]').value = ins.categoria_id || '';
      }
    } else if (k === 'categoria_insumo_id') it.categoria_insumo_id = e.target.value ? Number(e.target.value) : null;
    else if (k === 'quantidade' || k === 'valor_unitario') it[k] = num(e.target.value);
    else it[k] = e.target.value;
    atualizarTotais();
  });
  tbody.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; itens.splice(b.closest('tr').dataset.idx, 1); renderItens(); });
  $('#b-add').onclick = () => { itens.push({ categoria_insumo_id: null, insumo_id: null, descricao: '', unidade: 'un', quantidade: 1, valor_unitario: 0 }); renderItens(); tbody.querySelector('tr:last-of-type input[data-k=descricao]')?.focus(); };
  $('#b-add-grupo').onclick = () => { grupos.forEach((g) => { if (!itens.some((i) => i.categoria_insumo_id == g.id)) itens.push({ categoria_insumo_id: g.id, insumo_id: null, descricao: '', unidade: 'un', quantidade: 1, valor_unitario: 0 }); }); renderItens(); };
  $('[name=preco_venda]').addEventListener('input', atualizarTotais);
  renderItens();

  async function salvar() {
    const form = $('#f-peca');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const extras = {};
    for (const c of campos) {
      const raw = fd.get(`extra:${c.chave}`);
      if (c.tipo === 'booleano') extras[c.chave] = form.querySelector(`[name="extra:${c.chave}"]`).checked;
      else if (raw !== null && raw !== '') extras[c.chave] = c.tipo === 'numero' ? num(raw) : raw;
    }
    if (itens.some((i) => !i.descricao?.trim())) { toast('Todo item de custo precisa de uma descrição.', 'erro'); return; }
    const body = {
      nome: fd.get('nome').trim(), codigo: fd.get('codigo').trim() || null,
      colecao_id: fd.get('colecao_id') ? Number(fd.get('colecao_id')) : null, categoria_id: fd.get('categoria_id') ? Number(fd.get('categoria_id')) : null,
      tamanho: fd.get('tamanho').trim() || null, cor: fd.get('cor').trim() || null,
      quantidade_estoque: parseInt(fd.get('quantidade_estoque'), 10) || 0, estoque_minimo: parseInt(fd.get('estoque_minimo'), 10) || 0,
      preco_venda: num(fd.get('preco_venda')), descricao: fd.get('descricao').trim() || null, campos_extras: extras, ativo: form.querySelector('[name=ativo]').checked,
      itens_custo: itens.map((i, idx) => ({ insumo_id: i.insumo_id || null, categoria_insumo_id: i.categoria_insumo_id || null, descricao: i.descricao.trim(), unidade: i.unidade || 'un', quantidade: num(i.quantidade), valor_unitario: num(i.valor_unitario), ordem: idx })),
    };
    try {
      const salvo = nova ? await api('/api/produtos', { method: 'POST', body }) : await api(`/api/produtos/${p.id}`, { method: 'PUT', body });
      toast(`Peça salva · custo ${fmtBRL(salvo.custo_producao)}`);
      if (nova) location.hash = `#/peca/${salvo.id}`; else navegar();
    } catch (err) { toast(err.message, 'erro'); }
  }
  $('#b-salvar').onclick = salvar;
  $('#f-peca').onsubmit = (e) => { e.preventDefault(); salvar(); };
  if (!nova) {
    $('#b-mov').onclick = () => abrirMovimentacao(p, navegar);
    $('#b-dup').onclick = async () => { const n = await api(`/api/produtos/${p.id}/duplicar`, { method: 'POST' }); toast('Peça duplicada'); location.hash = `#/peca/${n.id}`; };
  }
});

// =====================================================================
// INSUMOS
// =====================================================================
rota('insumos', async () => {
  await carregarCadastros();
  const estado = { q: '', categoria_id: '' };
  conteudo.innerHTML = `
    ${cabecalho('Insumos', `<a class="btn suave" href="/api/exportar/insumos.csv">CSV</a><button class="btn serifa" id="b-novo">novo insumo</button>`, 'Catálogo de custos')}
    <p class="muted" style="max-width:720px">Aqui ficam tecidos, botões, zíperes, etiquetas, aviamentos, mão de obra, embalagens e sacolas com o valor unitário padrão. Ao montar a composição de uma peça, escolher um insumo preenche a descrição, a unidade e o valor automaticamente.</p>
    <div class="filtros">
      <div class="campo busca"><label>Buscar</label><input type="search" id="f-q" placeholder="nome ou fornecedor"></div>
      <div class="campo"><label>Grupo</label><select id="f-grupo">${options(cache.grupos, '', { vazio: 'todos' })}</select></div>
    </div>
    <div class="card" style="padding:0"><div class="tabela-wrap" id="tabela"></div></div>`;
  async function render() {
    const qs = new URLSearchParams(); if (estado.q) qs.set('q', estado.q); if (estado.categoria_id) qs.set('categoria_id', estado.categoria_id);
    const lista = await api(`/api/insumos?${qs}`);
    $('#tabela').innerHTML = lista.length ? `<table>
      <thead><tr><th>Insumo</th><th>Grupo</th><th>Un.</th><th class="num">Custo unitário</th><th>Fornecedor</th><th class="num">Usado em</th><th></th></tr></thead>
      <tbody>${lista.map((i) => `<tr>
        <td><a class="link-tabela" href="#" data-ed="${i.id}">${esc(i.nome)}</a>${i.ativo ? '' : ' <span class="tag inativo">inativo</span>'}${i.observacoes ? `<div class="small muted">${esc(i.observacoes)}</div>` : ''}</td>
        <td><span class="tag oliva">${esc(i.categoria_nome || '—')}</span></td><td>${esc(i.unidade)}</td><td class="num">${fmtBRL(i.custo_unitario)}</td>
        <td class="small">${esc(i.fornecedor || '—')}</td><td class="num">${i.usado_em} peça(s)</td>
        <td class="acoes"><button class="btn icone" data-ed="${i.id}" title="Editar">✎</button><button class="btn icone" data-del="${i.id}" title="Excluir">🗑</button></td></tr>`).join('')}</tbody></table>` : '<div class="vazio">nenhum insumo encontrado</div>';
    $$('#tabela [data-ed]').forEach((b) => b.onclick = (e) => { e.preventDefault(); formInsumo(lista.find((i) => i.id == b.dataset.ed), render); });
    $$('#tabela [data-del]').forEach((b) => b.onclick = async () => {
      const i = lista.find((x) => x.id == b.dataset.del);
      if (await confirmar(`Excluir "${i.nome}"? As composições que o usam mantêm os valores, só perdem o vínculo.`)) { await api(`/api/insumos/${i.id}`, { method: 'DELETE' }); toast('Insumo excluído'); render(); }
    });
  }
  let t; $('#f-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { estado.q = e.target.value.trim(); render(); }, 250); };
  $('#f-grupo').onchange = (e) => { estado.categoria_id = e.target.value; render(); };
  $('#b-novo').onclick = () => formInsumo(null, render);
  render();
});

function formInsumo(i, depois) {
  const novo = !i;
  i = i || { nome: '', categoria_id: '', unidade: 'un', custo_unitario: 0, fornecedor: '', observacoes: '', ativo: true };
  modal({
    titulo: novo ? 'Novo insumo' : 'Editar insumo',
    corpo: `<form id="f-ins" class="form-grid">
      <div class="campo col-8"><label>Nome <span class="obrig">*</span></label><input type="text" name="nome" value="${esc(i.nome)}" required placeholder="ex.: Linho misto terracota"></div>
      <div class="campo col-4"><label>Grupo</label><select name="categoria_id">${options(cache.grupos, i.categoria_id)}</select></div>
      <div class="campo col-3"><label>Unidade</label><input type="text" name="unidade" list="l-un" value="${esc(i.unidade)}"><datalist id="l-un">${opcoesDe('unidade').map((u) => `<option value="${esc(u)}">`).join('')}</datalist></div>
      <div class="campo col-4"><label>Custo unitário (R$)</label><input type="number" name="custo_unitario" step="0.01" min="0" value="${i.custo_unitario}"></div>
      <div class="campo col-5"><label>Fornecedor</label><input type="text" name="fornecedor" value="${esc(i.fornecedor || '')}"></div>
      <div class="campo col-12"><label>Observações</label><input type="text" name="observacoes" value="${esc(i.observacoes || '')}"></div>
      <div class="campo col-6"><label class="check"><input type="checkbox" name="ativo" ${i.ativo ? 'checked' : ''}> insumo ativo</label></div>
      ${novo ? '' : `<div class="campo col-6"><label class="check"><input type="checkbox" name="atualizar"> atualizar o valor nas ${i.usado_em || 0} peça(s) que usam este insumo</label></div>`}
      <div class="form-rodape col-12"><button type="button" class="btn suave" data-c>Cancelar</button><button class="btn" type="submit">Salvar</button></div>
    </form>`,
    aoAbrir(el, fechar) {
      el.querySelector('[data-c]').onclick = fechar;
      el.querySelector('#f-ins').onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target; const fd = new FormData(f);
        const body = { nome: fd.get('nome').trim(), categoria_id: fd.get('categoria_id') ? Number(fd.get('categoria_id')) : null, unidade: fd.get('unidade').trim() || 'un', custo_unitario: num(fd.get('custo_unitario')), fornecedor: fd.get('fornecedor').trim() || null, observacoes: fd.get('observacoes').trim() || null, ativo: f.querySelector('[name=ativo]').checked };
        try {
          if (novo) await api('/api/insumos', { method: 'POST', body });
          else await api(`/api/insumos/${i.id}?atualizar_composicoes=${f.querySelector('[name=atualizar]')?.checked ? 'true' : 'false'}`, { method: 'PUT', body });
          toast('Insumo salvo'); fechar(); await carregarCadastros(); depois && depois();
        } catch (err) { toast(err.message, 'erro'); }
      };
    },
  });
}

// =====================================================================
// ESTOQUE
// =====================================================================
rota('estoque', async () => {
  const produtos = await api('/api/produtos?ordenar=nome');
  const estado = { produto_id: '', tipo: '' };
  conteudo.innerHTML = `
    ${cabecalho('Estoque', `<button class="btn serifa" id="b-mov">registrar movimentação</button>`, 'Histórico de entradas e saídas')}
    <div class="filtros">
      <div class="campo busca"><label>Peça</label><select id="f-prod"><option value="">todas</option>${produtos.map((p) => `<option value="${p.id}">${esc(p.nome)} · ${esc(p.tamanho || '')} ${esc(p.cor || '')} (${p.quantidade_estoque} un)</option>`).join('')}</select></div>
      <div class="campo"><label>Tipo</label><select id="f-tipo"><option value="">todos</option><option value="entrada">entrada</option><option value="saida">saída</option><option value="ajuste">ajuste</option></select></div>
    </div>
    <div class="card" style="padding:0"><div class="tabela-wrap" id="tabela"></div></div>`;
  async function render() {
    const qs = new URLSearchParams(); if (estado.produto_id) qs.set('produto_id', estado.produto_id); if (estado.tipo) qs.set('tipo', estado.tipo);
    const lista = await api(`/api/estoque/movimentacoes?${qs}`);
    $('#tabela').innerHTML = lista.length ? `<table>
      <thead><tr><th>Data</th><th>Peça</th><th>Tipo</th><th class="num">Qtd.</th><th class="num">Estoque após</th><th>Motivo</th><th>Observação</th><th></th></tr></thead>
      <tbody>${lista.map((m) => `<tr>
        <td class="small mono">${fmtData(m.data)}</td>
        <td><a class="link-tabela" href="#/peca/${m.produto_id}">${esc(m.produto_nome || '—')}</a></td>
        <td><span class="tag ${m.tipo === 'entrada' ? 'ok' : m.tipo === 'saida' ? 'baixo' : 'mostarda'}">${m.tipo}</span></td>
        <td class="num">${m.tipo === 'saida' ? '−' : m.tipo === 'entrada' ? '+' : '='}${m.quantidade}</td>
        <td class="num">${m.estoque_resultante ?? '—'}</td><td>${esc(m.motivo || '—')}</td><td class="small muted">${esc(m.observacao || '')}</td>
        <td class="acoes"><button class="btn icone" data-del="${m.id}" title="Apagar registro">🗑</button></td></tr>`).join('')}</tbody></table>` : '<div class="vazio">nenhuma movimentação registrada</div>';
    $$('#tabela [data-del]').forEach((b) => b.onclick = async () => { if (await confirmar('Apagar este registro do histórico? O estoque atual da peça não é alterado.')) { await api(`/api/estoque/movimentacoes/${b.dataset.del}`, { method: 'DELETE' }); render(); } });
  }
  $('#f-prod').onchange = (e) => { estado.produto_id = e.target.value; render(); };
  $('#f-tipo').onchange = (e) => { estado.tipo = e.target.value; render(); };
  $('#b-mov').onclick = () => {
    modal({
      titulo: 'Qual peça?',
      corpo: `<div class="campo"><label>Peça</label><select id="sel-p">${produtos.map((p) => `<option value="${p.id}">${esc(p.nome)} · ${esc(p.tamanho || '')} ${esc(p.cor || '')} (${p.quantidade_estoque} un)</option>`).join('')}</select></div><div class="form-rodape"><button class="btn" id="ok-p">Continuar</button></div>`,
      aoAbrir(el, fechar) { el.querySelector('#ok-p').onclick = () => { const p = produtos.find((x) => x.id == el.querySelector('#sel-p').value); fechar(); abrirMovimentacao(p, () => navegar()); }; },
    });
  };
  render();
});

// =====================================================================
// CADASTROS (coleções, categorias, grupos de custo, opções, campos)
// =====================================================================
const ABAS = [
  { id: 'colecoes', rotulo: 'Coleções / capítulos', api: '/api/colecoes', cols: [['nome', 'Nome'], ['ano', 'Ano'], ['descricao', 'Descrição'], ['total_produtos', 'Peças']],
    form: (c = {}) => `<div class="campo col-8"><label>Nome <span class="obrig">*</span></label><input name="nome" type="text" required value="${esc(c.nome || '')}" placeholder="ex.: Capítulo 3 · Maré"></div><div class="campo col-4"><label>Ano</label><input name="ano" type="number" value="${c.ano ?? ''}"></div><div class="campo col-12"><label>Descrição</label><textarea name="descricao">${esc(c.descricao || '')}</textarea></div><div class="campo col-12"><label class="check"><input type="checkbox" name="ativa" ${c.ativa !== false ? 'checked' : ''}> coleção ativa</label></div>`,
    ler: (f, fd) => ({ nome: fd.get('nome').trim(), ano: fd.get('ano') ? parseInt(fd.get('ano'), 10) : null, descricao: fd.get('descricao').trim() || null, ativa: f.querySelector('[name=ativa]').checked }) },
  { id: 'categorias', rotulo: 'Categorias de peça', api: '/api/categorias', cols: [['nome', 'Nome'], ['descricao', 'Descrição'], ['total_produtos', 'Peças']],
    form: (c = {}) => `<div class="campo col-12"><label>Nome <span class="obrig">*</span></label><input name="nome" type="text" required value="${esc(c.nome || '')}" placeholder="ex.: Vestidos"></div><div class="campo col-12"><label>Descrição</label><input name="descricao" type="text" value="${esc(c.descricao || '')}"></div>`,
    ler: (f, fd) => ({ nome: fd.get('nome').trim(), descricao: fd.get('descricao').trim() || null }) },
  { id: 'grupos', rotulo: 'Grupos de custo', api: '/api/categorias-insumo', cols: [['nome', 'Nome'], ['ordem', 'Ordem'], ['total_insumos', 'Insumos']],
    form: (c = {}) => `<div class="campo col-8"><label>Nome <span class="obrig">*</span></label><input name="nome" type="text" required value="${esc(c.nome || '')}" placeholder="ex.: Bordado"></div><div class="campo col-4"><label>Ordem</label><input name="ordem" type="number" value="${c.ordem ?? 0}"></div>`,
    ler: (f, fd) => ({ nome: fd.get('nome').trim(), ordem: parseInt(fd.get('ordem'), 10) || 0 }) },
  { id: 'opcoes', rotulo: 'Tamanhos, cores e unidades', api: '/api/opcoes', cols: [['tipo', 'Tipo'], ['valor', 'Valor'], ['ordem', 'Ordem']],
    form: (c = {}) => `<div class="campo col-4"><label>Tipo</label><select name="tipo">${['tamanho', 'cor', 'unidade', 'motivo'].map((t) => `<option ${c.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="campo col-5"><label>Valor <span class="obrig">*</span></label><input name="valor" type="text" required value="${esc(c.valor || '')}"></div><div class="campo col-3"><label>Ordem</label><input name="ordem" type="number" value="${c.ordem ?? 0}"></div>`,
    ler: (f, fd) => ({ tipo: fd.get('tipo'), valor: fd.get('valor').trim(), ordem: parseInt(fd.get('ordem'), 10) || 0 }) },
  { id: 'campos', rotulo: 'Campos personalizados', api: '/api/campos', cols: [['rotulo', 'Rótulo'], ['chave', 'Chave'], ['tipo', 'Tipo'], ['obrigatorio', 'Obrigatório'], ['ativo', 'Ativo']],
    form: (c = {}) => `<div class="campo col-6"><label>Rótulo <span class="obrig">*</span></label><input name="rotulo" type="text" required value="${esc(c.rotulo || '')}" placeholder="ex.: Composição do tecido"></div><div class="campo col-6"><label>Chave (letras minúsculas e _)</label><input name="chave" type="text" pattern="[a-z0-9_]+" value="${esc(c.chave || '')}" placeholder="gerada a partir do rótulo"></div><div class="campo col-4"><label>Tipo</label><select name="tipo">${['texto', 'numero', 'lista', 'booleano', 'data'].map((t) => `<option ${c.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="campo col-8"><label>Opções (para tipo lista, separadas por vírgula)</label><input name="opcoes" type="text" value="${esc((c.opcoes || []).join(', '))}"></div><div class="campo col-3"><label>Ordem</label><input name="ordem" type="number" value="${c.ordem ?? 0}"></div><div class="campo col-4"><label class="check" style="padding-top:.45rem"><input type="checkbox" name="obrigatorio" ${c.obrigatorio ? 'checked' : ''}> obrigatório</label></div><div class="campo col-4"><label class="check" style="padding-top:.45rem"><input type="checkbox" name="ativo" ${c.ativo !== false ? 'checked' : ''}> ativo</label></div>`,
    ler: (f, fd) => {
      const rot = fd.get('rotulo').trim();
      const chave = (fd.get('chave').trim() || rot).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      return { rotulo: rot, chave, tipo: fd.get('tipo'), opcoes: fd.get('tipo') === 'lista' ? fd.get('opcoes').split(',').map((s) => s.trim()).filter(Boolean) : null, ordem: parseInt(fd.get('ordem'), 10) || 0, obrigatorio: f.querySelector('[name=obrigatorio]').checked, ativo: f.querySelector('[name=ativo]').checked };
    } },
];

rota('cadastros', async (aba = 'colecoes') => {
  const cfg = ABAS.find((a) => a.id === aba) || ABAS[0];
  conteudo.innerHTML = `
    ${cabecalho('Cadastros', `<button class="btn serifa" id="b-novo">novo registro</button>`, 'Tudo que é modular fica aqui')}
    <div class="abas">${ABAS.map((a) => `<button class="${a.id === cfg.id ? 'ativo' : ''}" data-aba="${a.id}">${a.rotulo}</button>`).join('')}</div>
    <p class="muted small" id="ajuda-aba"></p>
    <div class="card" style="padding:0"><div class="tabela-wrap" id="tabela"></div></div>`;
  $('#ajuda-aba').textContent = {
    colecoes: 'Coleções ou capítulos da marca. Cada peça pode pertencer a um.',
    categorias: 'Tipos de peça: camisas, calças, bermudas, lenços… crie quantas precisar.',
    grupos: 'Grupos usados na composição de custo (tecido, botões, mão de obra, sacola…). Aparecem no resumo do custo e no painel.',
    opcoes: 'Listas de sugestão para tamanho, cor, unidade de medida e motivo de movimentação. Os campos continuam aceitando valores novos digitados.',
    campos: 'Campos extras do cadastro de peça. Ex.: composição do tecido, modelagem, tempo de produção. Aparecem automaticamente no formulário.',
  }[cfg.id];
  $$('.abas button').forEach((b) => b.onclick = () => { location.hash = `#/cadastros/${b.dataset.aba}`; });
  const fmtCel = (v) => v === true ? 'sim' : v === false ? 'não' : v === null || v === undefined ? '—' : esc(v);
  async function render() {
    const lista = await api(cfg.api);
    $('#tabela').innerHTML = lista.length ? `<table><thead><tr>${cfg.cols.map(([, r]) => `<th>${r}</th>`).join('')}<th></th></tr></thead>
      <tbody>${lista.map((r) => `<tr>${cfg.cols.map(([k]) => `<td>${fmtCel(r[k])}</td>`).join('')}<td class="acoes"><button class="btn icone" data-ed="${r.id}" title="Editar">✎</button><button class="btn icone" data-del="${r.id}" title="Excluir">🗑</button></td></tr>`).join('')}</tbody></table>` : '<div class="vazio">nenhum registro</div>';
    $$('#tabela [data-ed]').forEach((b) => b.onclick = () => abrirForm(lista.find((r) => r.id == b.dataset.ed)));
    $$('#tabela [data-del]').forEach((b) => b.onclick = async () => {
      const r = lista.find((x) => x.id == b.dataset.del);
      const uso = r.total_produtos || r.total_insumos || 0;
      if (await confirmar(`Excluir "${r.nome || r.valor || r.rotulo}"?${uso ? ` ${uso} registro(s) vinculado(s) ficarão sem esse valor.` : ''}`)) {
        try { await api(`${cfg.api}/${r.id}`, { method: 'DELETE' }); toast('Excluído'); render(); } catch (err) { toast(err.message, 'erro'); }
      }
    });
  }
  function abrirForm(r) {
    modal({
      titulo: r ? 'Editar' : 'Novo registro',
      corpo: `<form id="f-cad" class="form-grid">${cfg.form(r || {})}<div class="form-rodape col-12"><button type="button" class="btn suave" data-c>Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>`,
      aoAbrir(el, fechar) {
        el.querySelector('[data-c]').onclick = fechar;
        el.querySelector('#f-cad').onsubmit = async (e) => {
          e.preventDefault();
          const body = cfg.ler(e.target, new FormData(e.target));
          try { await api(r ? `${cfg.api}/${r.id}` : cfg.api, { method: r ? 'PUT' : 'POST', body }); toast('Salvo'); fechar(); render(); } catch (err) { toast(err.message, 'erro'); }
        };
      },
    });
  }
  $('#b-novo').onclick = () => abrirForm(null);
  render();
});

// ---------- inicialização ----------
(async () => {
  try { const me = await api('/api/me'); $('#usuario-atual').textContent = `Olá, ${me.usuario}`; } catch { return; }
  $('#sair').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.href = '/login'; };
  $('#hamburger').onclick = () => $('#nav').classList.toggle('aberto');
  navegar();
})();
