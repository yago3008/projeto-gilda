/* ------------------------------------------------------------------
   GILDA; — "backend" no navegador
   Reimplementa as rotas da antiga API (FastAPI) em cima do localStorage,
   então o app.js continua chamando api('/api/...') sem saber que não há servidor.
   ------------------------------------------------------------------ */
'use strict';

const GildaDB = (() => {
  const CHAVE = 'gilda:dados:v1';
  let memoria = null; // usado quando o localStorage não está disponível (aba anônima, bloqueio)
  let semStorage = false;

  // ---------- utilidades ----------
  const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
  const r1 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 10) / 10;
  const agora = () => new Date().toISOString();
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const contem = (txt, q) => (txt || '').toLocaleLowerCase('pt-BR').includes(q.toLocaleLowerCase('pt-BR'));
  const cmp = (a, b) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1; // como no SQLite: nulos primeiro em ordem crescente
    if (b === null || b === undefined) return 1;
    return typeof a === 'string' ? a.localeCompare(b, 'pt-BR') : a - b;
  };
  const ordenarPor = (lista, ...chaves) => lista.sort((x, y) => {
    for (const k of chaves) { const c = typeof k === 'function' ? k(x, y) : cmp(x[k], y[k]); if (c) return c; }
    return 0;
  });

  class ErroApi extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
  }
  const falha = (status, msg) => { throw new ErroApi(status, msg); };
  const exigir = (cond, msg, status = 422) => { if (!cond) falha(status, msg); };
  const texto = (v, rotulo, max) => {
    const s = typeof v === 'string' ? v.trim() : '';
    exigir(s.length >= 1, `O campo "${rotulo}" é obrigatório.`);
    exigir(s.length <= max, `O campo "${rotulo}" aceita no máximo ${max} caracteres.`);
    return s;
  };
  const naoNeg = (v, rotulo, padrao = 0) => {
    const n = v === undefined || v === null || v === '' ? padrao : Number(v);
    exigir(Number.isFinite(n) && n >= 0, `O campo "${rotulo}" não pode ser negativo.`);
    return n;
  };
  const inteiro = (v, rotulo, padrao = 0) => Math.trunc(naoNeg(v, rotulo, padrao));
  const idOuNulo = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  const opcional = (v) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? null : (typeof v === 'string' ? v.trim() : v));

  // ---------- armazenamento ----------
  function vazio() {
    return {
      versao: 1,
      seq: { colecoes: 0, categorias: 0, opcoes: 0, campos: 0, grupos: 0, insumos: 0, produtos: 0, itens: 0, movs: 0 },
      colecoes: [], categorias: [], opcoes: [], campos: [], grupos: [], insumos: [], produtos: [], movs: [],
    };
  }
  function carregar() {
    if (semStorage) return memoria;
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (bruto) return JSON.parse(bruto);
    } catch (e) {
      if (!(e instanceof SyntaxError)) { semStorage = true; }
    }
    const db = vazio();
    popularBase(db);
    popularExemplo(db);
    gravar(db);
    return semStorage ? memoria : db;
  }
  function gravar(db) {
    if (!semStorage) {
      try { localStorage.setItem(CHAVE, JSON.stringify(db)); return; } catch (e) {
        if (e && e.name === 'QuotaExceededError') falha(507, 'O armazenamento do navegador está cheio. Faça um backup e apague dados antigos.');
        semStorage = true;
      }
    }
    memoria = db;
  }
  const novoId = (db, tabela) => ++db.seq[tabela];
  const porId = (lista, id) => lista.find((o) => o.id === Number(id));

  // ---------- dados iniciais (mesmo conteúdo do antigo seed.py) ----------
  function popularBase(db) {
    const add = (tabela, obj) => { const o = { id: novoId(db, tabela), ...obj }; db[tabela].push(o); return o; };
    ['Camisas', 'Calças', 'Bermudas', 'Lenços', 'Vestidos', 'Blazers'].forEach((nome) => add('categorias', { nome, descricao: null }));
    ['Tecido', 'Botões', 'Zíperes', 'Etiquetas', 'Aviamentos', 'Mão de obra', 'Embalagem', 'Sacola', 'Outros'].forEach((nome, ordem) => add('grupos', { nome, ordem }));
    const listas = {
      tamanho: ['PP', 'P', 'M', 'G', 'GG', 'Único'],
      cor: ['Off-white', 'Creme', 'Terracota', 'Marrom', 'Preto', 'Mostarda', 'Oliva', 'Azul'],
      unidade: ['un', 'm', 'cm', 'kg', 'g', 'par', 'h', 'rolo', 'cone'],
      motivo: ['produção', 'venda', 'devolução', 'perda', 'inventário', 'ajuste'],
    };
    for (const [tipo, valores] of Object.entries(listas)) valores.forEach((valor, ordem) => add('opcoes', { tipo, valor, ordem }));
    add('campos', { chave: 'composicao_tecido', rotulo: 'Composição do tecido', tipo: 'texto', opcoes: null, obrigatorio: false, ordem: 1, ativo: true });
    add('campos', { chave: 'modelagem', rotulo: 'Modelagem', tipo: 'lista', opcoes: ['Reta', 'Ampla', 'Ajustada', 'Oversized'], obrigatorio: false, ordem: 2, ativo: true });
    add('campos', { chave: 'tempo_producao_horas', rotulo: 'Tempo de produção (h)', tipo: 'numero', opcoes: null, obrigatorio: false, ordem: 3, ativo: true });
  }

  function popularExemplo(db) {
    const grp = Object.fromEntries(db.grupos.map((g) => [g.nome, g.id]));
    const cat = Object.fromEntries(db.categorias.map((c) => [c.nome, c.id]));
    const col = {};
    for (const [nome, ano, descricao] of [
      ['Capítulo 1 · Origem', 2025, 'Primeira coleção: releitura da alfaiataria clássica.'],
      ['Capítulo 2 · Ritual', 2026, 'Peças inspiradas em pequenos rituais do cotidiano brasileiro.'],
    ]) { const c = { id: novoId(db, 'colecoes'), nome, descricao, ano, ativa: true }; db.colecoes.push(c); col[nome] = c.id; }

    const ins = {};
    for (const [nome, grupo, unidade, custo_unitario, fornecedor] of [
      ['Algodão egípcio off-white', 'Tecido', 'm', 68.0, 'Tecelagem Aurora'],
      ['Linho misto terracota', 'Tecido', 'm', 74.0, 'Tecelagem Aurora'],
      ['Sarja de algodão marrom', 'Tecido', 'm', 52.0, 'Casa do Tecido'],
      ['Seda estampada', 'Tecido', 'm', 120.0, 'Sedas Paraná'],
      ['Botão madrepérola 12mm', 'Botões', 'un', 1.9, 'Aviamentos Centro'],
      ['Botão de coco 18mm', 'Botões', 'un', 1.4, 'Aviamentos Centro'],
      ['Zíper invisível 20cm', 'Zíperes', 'un', 3.2, 'Aviamentos Centro'],
      ['Etiqueta de composição', 'Etiquetas', 'un', 0.45, 'Gráfica Têxtil'],
      ['Etiqueta bordada GILDA;', 'Etiquetas', 'un', 1.8, 'Gráfica Têxtil'],
      ['Linha 120 (cone)', 'Aviamentos', 'cone', 9.5, 'Aviamentos Centro'],
      ['Entretela leve', 'Aviamentos', 'm', 8.0, 'Casa do Tecido'],
      ['Elástico 3cm', 'Aviamentos', 'm', 2.2, 'Aviamentos Centro'],
      ['Costura (ateliê)', 'Mão de obra', 'h', 38.0, 'Ateliê parceiro'],
      ['Corte', 'Mão de obra', 'h', 32.0, 'Ateliê parceiro'],
      ['Acabamento e passadoria', 'Mão de obra', 'h', 30.0, 'Ateliê parceiro'],
      ['Papel de seda', 'Embalagem', 'un', 0.9, 'Embalagens Curitiba'],
      ['Caixa kraft', 'Embalagem', 'un', 4.6, 'Embalagens Curitiba'],
      ['Sacola de algodão GILDA;', 'Sacola', 'un', 7.5, 'Embalagens Curitiba'],
      ['Cartão de agradecimento', 'Embalagem', 'un', 0.7, 'Gráfica Têxtil'],
    ]) {
      const i = { id: novoId(db, 'insumos'), nome, categoria_id: grp[grupo], unidade, custo_unitario, fornecedor, observacoes: null, ativo: true };
      db.insumos.push(i); ins[nome] = i;
    }

    const peca = (nome, codigo, colecao, categoria, tamanho, cor, estoque, minimo, preco, descricao, itens, extras = {}) => {
      const t = agora();
      const p = {
        id: novoId(db, 'produtos'), nome, codigo, colecao_id: col[colecao], categoria_id: cat[categoria], tamanho, cor,
        quantidade_estoque: estoque, estoque_minimo: minimo, preco_venda: preco, custo_producao: 0, descricao,
        campos_extras: extras, ativo: true, criado_em: t, atualizado_em: t, itens_custo: [],
      };
      itens.forEach(([insNome, qtd], ordem) => {
        const i = ins[insNome];
        p.itens_custo.push({
          id: novoId(db, 'itens'), insumo_id: i.id, categoria_insumo_id: i.categoria_id, descricao: i.nome, unidade: i.unidade,
          quantidade: qtd, valor_unitario: i.custo_unitario, valor_total: r2(qtd * i.custo_unitario), ordem,
        });
      });
      recalcular(p);
      db.produtos.push(p);
      if (estoque) db.movs.push({ id: novoId(db, 'movs'), produto_id: p.id, tipo: 'entrada', quantidade: estoque, motivo: 'produção', observacao: null, data: t, estoque_resultante: estoque });
    };

    const camisa = [
      ['Algodão egípcio off-white', 1.8], ['Botão madrepérola 12mm', 9], ['Etiqueta de composição', 1], ['Etiqueta bordada GILDA;', 1],
      ['Linha 120 (cone)', 0.15], ['Entretela leve', 0.3], ['Corte', 0.5], ['Costura (ateliê)', 2.5], ['Acabamento e passadoria', 0.5],
      ['Papel de seda', 2], ['Caixa kraft', 1], ['Sacola de algodão GILDA;', 1], ['Cartão de agradecimento', 1],
    ];
    for (const [tam, est] of [['PP', 3], ['P', 5], ['M', 4], ['G', 2], ['GG', 0]]) {
      peca('Camisa Grão', `CAM-GRAO-OW-${tam}`, 'Capítulo 2 · Ritual', 'Camisas', tam, 'Off-white', est, 2, 429.0,
        'Releitura da camisaria clássica com punho duplo. Algodão egípcio.', camisa,
        { composicao_tecido: '100% algodão egípcio', modelagem: 'Ampla', tempo_producao_horas: 3.5 });
    }
    peca('Camisa Casulo', 'CAM-CASULO-TE-M', 'Capítulo 2 · Ritual', 'Camisas', 'M', 'Terracota', 3, 2, 399.0,
      'Camisa de linho misto com modelagem envolvente.',
      [['Linho misto terracota', 1.7], ['Botão de coco 18mm', 7], ['Etiqueta de composição', 1], ['Etiqueta bordada GILDA;', 1],
        ['Linha 120 (cone)', 0.15], ['Corte', 0.5], ['Costura (ateliê)', 2.2], ['Acabamento e passadoria', 0.5],
        ['Papel de seda', 2], ['Caixa kraft', 1], ['Sacola de algodão GILDA;', 1]],
      { composicao_tecido: '55% linho, 45% algodão', modelagem: 'Oversized', tempo_producao_horas: 3.2 });
    const calca = [
      ['Sarja de algodão marrom', 1.6], ['Zíper invisível 20cm', 1], ['Botão de coco 18mm', 1], ['Etiqueta de composição', 1],
      ['Etiqueta bordada GILDA;', 1], ['Linha 120 (cone)', 0.2], ['Entretela leve', 0.2], ['Corte', 0.6], ['Costura (ateliê)', 3.0],
      ['Acabamento e passadoria', 0.6], ['Papel de seda', 2], ['Caixa kraft', 1], ['Sacola de algodão GILDA;', 1],
    ];
    for (const [tam, est] of [['P', 2], ['M', 4], ['G', 1]]) {
      peca('Calça Torra', `CAL-TORRA-MR-${tam}`, 'Capítulo 1 · Origem', 'Calças', tam, 'Marrom', est, 2, 569.0,
        'Calça de alfaiataria com pregas e cintura alta.', calca,
        { composicao_tecido: '100% algodão', modelagem: 'Reta', tempo_producao_horas: 4.2 });
    }
    const bermuda = [
      ['Linho misto terracota', 1.1], ['Zíper invisível 20cm', 1], ['Botão de coco 18mm', 1], ['Elástico 3cm', 0.4],
      ['Etiqueta de composição', 1], ['Etiqueta bordada GILDA;', 1], ['Linha 120 (cone)', 0.1], ['Corte', 0.4],
      ['Costura (ateliê)', 2.0], ['Acabamento e passadoria', 0.4], ['Papel de seda', 1], ['Caixa kraft', 1], ['Sacola de algodão GILDA;', 1],
    ];
    for (const [tam, est] of [['P', 3], ['M', 3], ['G', 2]]) {
      peca('Bermuda Envolto', `BER-ENV-TE-${tam}`, 'Capítulo 2 · Ritual', 'Bermudas', tam, 'Terracota', est, 1, 415.0,
        'Bermuda de pregas com cós envolvente.', bermuda,
        { composicao_tecido: '55% linho, 45% algodão', modelagem: 'Ampla', tempo_producao_horas: 2.8 });
    }
    const lenco = [
      ['Seda estampada', 0.5], ['Etiqueta de composição', 1], ['Linha 120 (cone)', 0.05], ['Corte', 0.15],
      ['Costura (ateliê)', 0.5], ['Papel de seda', 1], ['Sacola de algodão GILDA;', 1], ['Cartão de agradecimento', 1],
    ];
    peca('Lenço Manacá', 'LEN-MANACA-UN', 'Capítulo 2 · Ritual', 'Lenços', 'Único', 'Terracota', 12, 3, 127.0,
      'Lenço de seda com estampa exclusiva.', lenco, { composicao_tecido: '100% seda' });
    peca('Lenço Oitenta-e-oito', 'LEN-88-UN', 'Capítulo 1 · Origem', 'Lenços', 'Único', 'Mostarda', 0, 3, 127.0,
      'Lenço de seda com estampa geométrica.', lenco, { composicao_tecido: '100% seda' });
  }

  // ---------- regras de negócio ----------
  function recalcular(p) { p.custo_producao = r2(p.itens_custo.reduce((s, i) => s + i.valor_total, 0)); return p.custo_producao; }
  const nomeDe = (lista, id) => (id ? porId(lista, id)?.nome ?? null : null);
  const margem = (p) => { const valor = r2((p.preco_venda || 0) - (p.custo_producao || 0)); return [valor, p.preco_venda ? r1(valor / p.preco_venda * 100) : null]; };

  function grupoDoItem(db, i) {
    const g = i.categoria_insumo_id ? porId(db.grupos, i.categoria_insumo_id) : null;
    if (g) return g.nome;
    const ins = i.insumo_id ? porId(db.insumos, i.insumo_id) : null;
    return ins ? nomeDe(db.grupos, ins.categoria_id) : null;
  }

  function resumo(db, p) {
    const [margem_valor, margem_percentual] = margem(p);
    return {
      id: p.id, nome: p.nome, codigo: p.codigo, colecao_id: p.colecao_id, categoria_id: p.categoria_id,
      colecao_nome: nomeDe(db.colecoes, p.colecao_id), categoria_nome: nomeDe(db.categorias, p.categoria_id),
      tamanho: p.tamanho, cor: p.cor, quantidade_estoque: p.quantidade_estoque, estoque_minimo: p.estoque_minimo,
      preco_venda: p.preco_venda, custo_producao: p.custo_producao, margem_valor, margem_percentual, ativo: p.ativo, atualizado_em: p.atualizado_em,
    };
  }
  function completo(db, p) {
    return {
      ...resumo(db, p), descricao: p.descricao, campos_extras: p.campos_extras || {}, criado_em: p.criado_em,
      itens_custo: ordenarPor([...p.itens_custo], 'ordem', 'id').map((i) => ({ ...i, categoria_insumo_nome: grupoDoItem(db, i) })),
    };
  }

  function validarExtras(db, valores) {
    const limpos = {};
    for (const c of db.campos.filter((c) => c.ativo)) {
      let v = valores?.[c.chave];
      const vazioV = v === undefined || v === null || v === '';
      exigir(!(vazioV && c.obrigatorio), `O campo '${c.rotulo}' é obrigatório.`);
      if (vazioV) continue;
      if (c.tipo === 'numero') { v = Number(v); exigir(Number.isFinite(v), `O campo '${c.rotulo}' precisa ser numérico.`); }
      else if (c.tipo === 'booleano') v = typeof v === 'string' ? ['1', 'true', 'sim'].includes(v.toLowerCase()) : Boolean(v);
      else if (c.tipo === 'lista' && c.opcoes?.length) exigir(c.opcoes.includes(v), `Valor inválido para '${c.rotulo}'.`);
      limpos[c.chave] = v;
    }
    return limpos;
  }

  function lerItem(db, it, ordem) {
    const insumo_id = idOuNulo(it.insumo_id);
    let categoria_insumo_id = idOuNulo(it.categoria_insumo_id);
    const insumo = insumo_id ? porId(db.insumos, insumo_id) : null;
    if (insumo && !categoria_insumo_id) categoria_insumo_id = insumo.categoria_id;
    const quantidade = naoNeg(it.quantidade, 'Quantidade', 1);
    const valor_unitario = naoNeg(it.valor_unitario, 'Valor unitário', 0);
    return {
      id: novoId(db, 'itens'), insumo_id: insumo ? insumo_id : null, categoria_insumo_id, descricao: texto(it.descricao, 'Descrição do item', 160),
      unidade: it.unidade || 'un', quantidade, valor_unitario, valor_total: r2(quantidade * valor_unitario), ordem,
    };
  }

  function lerProduto(db, d, idAtual = null) {
    const codigo = opcional(d.codigo);
    exigir(!codigo || !db.produtos.some((p) => p.codigo === codigo && p.id !== idAtual), 'Já existe uma peça com esse código.', 409);
    return {
      nome: texto(d.nome, 'Nome', 160), codigo,
      colecao_id: idOuNulo(d.colecao_id), categoria_id: idOuNulo(d.categoria_id),
      tamanho: opcional(d.tamanho), cor: opcional(d.cor),
      quantidade_estoque: inteiro(d.quantidade_estoque, 'Estoque'), estoque_minimo: inteiro(d.estoque_minimo, 'Estoque mínimo'),
      preco_venda: naoNeg(d.preco_venda, 'Preço de venda'), descricao: opcional(d.descricao),
      campos_extras: validarExtras(db, d.campos_extras || {}), ativo: d.ativo !== false,
    };
  }

  function produto(db, id) { return porId(db.produtos, id) || falha(404, 'Peça não encontrada.'); }
  function registrarMov(db, p, dados) {
    db.movs.push({ id: novoId(db, 'movs'), produto_id: p.id, observacao: null, data: agora(), estoque_resultante: p.quantidade_estoque, ...dados });
  }

  // ---------- cadastros genéricos ----------
  const CADASTROS = {
    colecoes: {
      ler: (d) => ({ nome: texto(d.nome, 'Nome', 120), descricao: opcional(d.descricao), ano: d.ano === null || d.ano === undefined || d.ano === '' ? null : Math.trunc(Number(d.ano)), ativa: d.ativa !== false }),
      unico: (a, b) => a.nome === b.nome,
      saida: (db, o) => ({ ...o, total_produtos: db.produtos.filter((p) => p.colecao_id === o.id).length }),
      ordem: (l) => ordenarPor(l, (a, b) => (a.ano === null) - (b.ano === null) || (b.ano ?? 0) - (a.ano ?? 0), 'nome'),
      excluir: (db, id) => db.produtos.forEach((p) => { if (p.colecao_id === id) p.colecao_id = null; }),
    },
    categorias: {
      ler: (d) => ({ nome: texto(d.nome, 'Nome', 80), descricao: opcional(d.descricao) }),
      unico: (a, b) => a.nome === b.nome,
      saida: (db, o) => ({ ...o, total_produtos: db.produtos.filter((p) => p.categoria_id === o.id).length }),
      ordem: (l) => ordenarPor(l, 'nome'),
      excluir: (db, id) => db.produtos.forEach((p) => { if (p.categoria_id === id) p.categoria_id = null; }),
    },
    opcoes: {
      ler: (d) => {
        exigir(['tamanho', 'cor', 'unidade', 'motivo'].includes(d.tipo), 'Tipo de opção inválido.');
        return { tipo: d.tipo, valor: texto(d.valor, 'Valor', 80), ordem: Math.trunc(Number(d.ordem) || 0) };
      },
      unico: (a, b) => a.tipo === b.tipo && a.valor === b.valor,
      saida: (db, o) => ({ ...o }),
      ordem: (l) => ordenarPor(l, 'tipo', 'ordem', 'valor'),
    },
    campos: {
      ler: (d) => {
        const chave = texto(d.chave, 'Chave', 60);
        exigir(/^[a-z0-9_]+$/.test(chave), 'A chave só pode ter letras minúsculas, números e _.');
        const tipo = d.tipo || 'texto';
        exigir(['texto', 'numero', 'lista', 'booleano', 'data'].includes(tipo), 'Tipo de campo inválido.');
        return { chave, rotulo: texto(d.rotulo, 'Rótulo', 120), tipo, opcoes: Array.isArray(d.opcoes) ? d.opcoes.map(String) : null, obrigatorio: !!d.obrigatorio, ordem: Math.trunc(Number(d.ordem) || 0), ativo: d.ativo !== false };
      },
      unico: (a, b) => a.chave === b.chave,
      saida: (db, o) => ({ ...o }),
      ordem: (l) => ordenarPor(l, 'ordem', 'id'),
    },
    grupos: {
      ler: (d) => ({ nome: texto(d.nome, 'Nome', 80), ordem: Math.trunc(Number(d.ordem) || 0) }),
      unico: (a, b) => a.nome === b.nome,
      saida: (db, o) => ({ ...o, total_insumos: db.insumos.filter((i) => i.categoria_id === o.id).length }),
      ordem: (l) => ordenarPor(l, 'ordem', 'nome'),
      excluir: (db, id) => {
        db.insumos.forEach((i) => { if (i.categoria_id === id) i.categoria_id = null; });
        db.produtos.forEach((p) => p.itens_custo.forEach((i) => { if (i.categoria_insumo_id === id) i.categoria_insumo_id = null; }));
      },
    },
  };
  const ROTA_CADASTRO = { colecoes: 'colecoes', categorias: 'categorias', opcoes: 'opcoes', campos: 'campos', 'categorias-insumo': 'grupos' };

  function cadastro(db, tabela, metodo, id, body) {
    const cfg = CADASTROS[tabela];
    const lista = db[tabela];
    if (metodo === 'GET' && id === undefined) return cfg.ordem([...lista]).map((o) => cfg.saida(db, o));
    if (metodo === 'POST' && id === undefined) {
      const o = cfg.ler(body || {});
      exigir(!lista.some((x) => cfg.unico(x, o)), 'Já existe um registro com esse nome.', 409);
      const novo = { id: novoId(db, tabela), ...o };
      lista.push(novo);
      return cfg.saida(db, novo);
    }
    const atual = porId(lista, id) || falha(404, 'Registro não encontrado.');
    if (metodo === 'PUT') {
      const o = cfg.ler(body || {});
      exigir(!lista.some((x) => x.id !== atual.id && cfg.unico(x, o)), 'Já existe um registro com esse nome.', 409);
      Object.assign(atual, o);
      return cfg.saida(db, atual);
    }
    if (metodo === 'DELETE') {
      cfg.excluir?.(db, atual.id);
      lista.splice(lista.indexOf(atual), 1);
      return null;
    }
    falha(405, 'Método não permitido.');
  }

  // ---------- insumos ----------
  function insumoSaida(db, i) {
    const usado = new Set();
    db.produtos.forEach((p) => p.itens_custo.forEach((it) => { if (it.insumo_id === i.id) usado.add(p.id); }));
    return { ...i, categoria_nome: nomeDe(db.grupos, i.categoria_id), usado_em: usado.size };
  }
  function lerInsumo(d) {
    return {
      nome: texto(d.nome, 'Nome', 160), categoria_id: idOuNulo(d.categoria_id), unidade: d.unidade || 'un',
      custo_unitario: naoNeg(d.custo_unitario, 'Custo unitário'), fornecedor: opcional(d.fornecedor), observacoes: opcional(d.observacoes), ativo: d.ativo !== false,
    };
  }

  // ---------- painel ----------
  function dashboard(db) {
    const produtos = db.produtos.filter((p) => p.ativo);
    const valor_custo = r2(produtos.reduce((s, p) => s + p.quantidade_estoque * p.custo_producao, 0));
    const valor_venda = r2(produtos.reduce((s, p) => s + p.quantidade_estoque * p.preco_venda, 0));
    const comPreco = produtos.filter((p) => p.preco_venda);
    const mg = (p) => (p.preco_venda - p.custo_producao) / p.preco_venda;

    const custo = new Map();
    for (const p of produtos) for (const i of p.itens_custo) {
      const nome = nomeDe(db.grupos, i.categoria_insumo_id) ?? 'Sem categoria';
      const c = custo.get(nome) || { categoria: nome, total_estoque: 0, total_unitario: 0 };
      c.total_estoque += i.valor_total * p.quantidade_estoque; c.total_unitario += i.valor_total;
      custo.set(nome, c);
    }
    const agrupar = (lista, sem) => {
      const m = new Map();
      for (const p of produtos) {
        const nome = nomeDe(lista, p[lista === db.categorias ? 'categoria_id' : 'colecao_id']) ?? sem;
        const g = m.get(nome) || { nome, pecas: 0, unidades: 0 };
        g.pecas += 1; g.unidades += p.quantidade_estoque; m.set(nome, g);
      }
      return [...m.values()].sort((a, b) => b.pecas - a.pecas);
    };
    const porNome = new Map(); comPreco.forEach((p) => { if (!porNome.has(p.nome)) porNome.set(p.nome, p); });
    const unicos = [...porNome.values()];
    const m = (p) => ({ id: p.id, nome: p.nome, preco_venda: p.preco_venda, custo_producao: p.custo_producao, margem_percentual: r1(mg(p) * 100) });

    return {
      total_pecas: produtos.length,
      unidades_estoque: produtos.reduce((s, p) => s + p.quantidade_estoque, 0),
      valor_estoque_custo: valor_custo,
      valor_estoque_venda: valor_venda,
      lucro_potencial: r2(valor_venda - valor_custo),
      margem_media: comPreco.length ? r1(comPreco.reduce((s, p) => s + mg(p), 0) / comPreco.length * 100) : null,
      total_insumos: db.insumos.length,
      estoque_baixo: [...produtos].sort((a, b) => a.quantidade_estoque - b.quantidade_estoque).filter((p) => p.quantidade_estoque <= p.estoque_minimo).slice(0, 10)
        .map((p) => ({ id: p.id, nome: p.nome, tamanho: p.tamanho, cor: p.cor, quantidade_estoque: p.quantidade_estoque, estoque_minimo: p.estoque_minimo })),
      sem_composicao: produtos.filter((p) => !p.itens_custo.length).slice(0, 10).map((p) => ({ id: p.id, nome: p.nome })),
      custo_por_categoria: [...custo.values()].sort((a, b) => b.total_unitario - a.total_unitario)
        .map((c) => ({ categoria: c.categoria, total_estoque: r2(c.total_estoque), total_unitario: r2(c.total_unitario) })),
      pecas_por_categoria: agrupar(db.categorias, 'Sem categoria'),
      pecas_por_colecao: agrupar(db.colecoes, 'Sem coleção'),
      melhores_margens: [...unicos].sort((a, b) => mg(b) - mg(a)).slice(0, 5).map(m),
      piores_margens: [...unicos].sort((a, b) => mg(a) - mg(b)).slice(0, 5).map(m),
      ultimas_movimentacoes: movsOrdenadas(db).slice(0, 8).map((x) => movSaida(db, x)),
    };
  }
  const movsOrdenadas = (db) => [...db.movs].sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
  const movSaida = (db, x) => ({ ...x, produto_nome: nomeDe(db.produtos, x.produto_id) });

  // ---------- roteador ----------
  function rotear(db, metodo, url, body) {
    const u = new URL(url, 'http://local');
    const q = u.searchParams;
    const partes = u.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    const [r0, r1_, r2_, r3] = partes;

    if (ROTA_CADASTRO[r0] && partes.length <= 2) return cadastro(db, ROTA_CADASTRO[r0], metodo, r1_, body);

    if (r0 === 'dashboard' && metodo === 'GET') return dashboard(db);

    if (r0 === 'insumos') {
      if (!r1_ && metodo === 'GET') {
        let l = db.insumos;
        const busca = q.get('q');
        if (busca) l = l.filter((i) => contem(i.nome, busca) || contem(i.fornecedor, busca));
        if (q.get('categoria_id')) l = l.filter((i) => i.categoria_id === Number(q.get('categoria_id')));
        if (q.get('somente_ativos') === 'true') l = l.filter((i) => i.ativo);
        return ordenarPor([...l], 'nome').map((i) => insumoSaida(db, i));
      }
      if (!r1_ && metodo === 'POST') { const i = { id: novoId(db, 'insumos'), ...lerInsumo(body || {}) }; db.insumos.push(i); return insumoSaida(db, i); }
      const ins = porId(db.insumos, r1_) || falha(404, 'Insumo não encontrado.');
      if (metodo === 'GET') return insumoSaida(db, ins);
      if (metodo === 'PUT') {
        Object.assign(ins, lerInsumo(body || {}));
        if (q.get('atualizar_composicoes') === 'true') {
          for (const p of db.produtos) {
            let mudou = false;
            for (const it of p.itens_custo) if (it.insumo_id === ins.id) {
              it.valor_unitario = ins.custo_unitario; it.unidade = ins.unidade; it.valor_total = r2(it.quantidade * it.valor_unitario); mudou = true;
            }
            if (mudou) { recalcular(p); p.atualizado_em = agora(); }
          }
        }
        return insumoSaida(db, ins);
      }
      if (metodo === 'DELETE') {
        db.produtos.forEach((p) => p.itens_custo.forEach((it) => { if (it.insumo_id === ins.id) it.insumo_id = null; }));
        db.insumos.splice(db.insumos.indexOf(ins), 1);
        return null;
      }
    }

    if (r0 === 'produtos') {
      if (!r1_ && metodo === 'GET') {
        let l = db.produtos;
        const busca = q.get('q');
        if (busca) l = l.filter((p) => contem(p.nome, busca) || contem(p.codigo, busca) || contem(p.cor, busca));
        for (const k of ['colecao_id', 'categoria_id']) if (q.get(k)) l = l.filter((p) => p[k] === Number(q.get(k)));
        for (const k of ['tamanho', 'cor']) if (q.get(k)) l = l.filter((p) => p[k] === q.get(k));
        if (q.get('somente_ativos') === 'true') l = l.filter((p) => p.ativo);
        if (q.get('estoque_baixo') === 'true') l = l.filter((p) => p.quantidade_estoque <= p.estoque_minimo);
        const col = q.get('ordenar') || 'nome';
        exigir(['nome', 'codigo', 'preco_venda', 'custo_producao', 'quantidade_estoque', 'atualizado_em'].includes(col), 'Ordenação inválida.');
        const desc = q.get('direcao') === 'desc';
        return [...l].sort((a, b) => (desc ? -1 : 1) * cmp(a[col], b[col])).map((p) => resumo(db, p));
      }
      if (!r1_ && metodo === 'POST') {
        const d = body || {};
        const t = agora();
        const p = { id: 0, ...lerProduto(db, d), custo_producao: 0, criado_em: t, atualizado_em: t, itens_custo: [] };
        p.itens_custo = (d.itens_custo || []).map((it, idx) => lerItem(db, it, idx));
        p.id = novoId(db, 'produtos');
        recalcular(p);
        db.produtos.push(p);
        if (p.quantidade_estoque) registrarMov(db, p, { tipo: 'entrada', quantidade: p.quantidade_estoque, motivo: 'cadastro inicial' });
        return completo(db, p);
      }
      const p = produto(db, r1_);
      if (!r2_) {
        if (metodo === 'GET') return completo(db, p);
        if (metodo === 'PUT') {
          const d = body || {};
          const dados = lerProduto(db, d, p.id);
          const itens = Array.isArray(d.itens_custo) ? d.itens_custo.map((it, idx) => lerItem(db, it, idx)) : null;
          const anterior = p.quantidade_estoque;
          Object.assign(p, dados, { atualizado_em: agora() });
          if (p.quantidade_estoque !== anterior) {
            registrarMov(db, p, { tipo: 'ajuste', quantidade: Math.abs(p.quantidade_estoque - anterior), motivo: 'edição do cadastro', observacao: `De ${anterior} para ${p.quantidade_estoque}` });
          }
          if (itens) { p.itens_custo = itens; recalcular(p); }
          return completo(db, p);
        }
        if (metodo === 'DELETE') {
          db.produtos.splice(db.produtos.indexOf(p), 1);
          db.movs = db.movs.filter((x) => x.produto_id !== p.id);
          return null;
        }
      }
      if (r2_ === 'duplicar' && metodo === 'POST') {
        const t = agora();
        const novo = {
          ...clone(p), id: novoId(db, 'produtos'), nome: `${p.nome} (cópia)`, codigo: null, quantidade_estoque: 0, criado_em: t, atualizado_em: t,
          itens_custo: p.itens_custo.map((i) => ({ ...i, id: novoId(db, 'itens') })),
        };
        recalcular(novo);
        db.produtos.push(novo);
        return completo(db, novo);
      }
      if (r2_ === 'custos') {
        if (!r3 && metodo === 'GET') return completo(db, p).itens_custo;
        if (!r3 && metodo === 'PUT') { p.itens_custo = (body || []).map((it, idx) => lerItem(db, it, idx)); recalcular(p); p.atualizado_em = agora(); return completo(db, p); }
        if (!r3 && metodo === 'POST') { p.itens_custo.push(lerItem(db, body || {}, p.itens_custo.length)); recalcular(p); p.atualizado_em = agora(); return completo(db, p); }
        if (r3 && metodo === 'DELETE') {
          const idx = p.itens_custo.findIndex((i) => i.id === Number(r3));
          exigir(idx >= 0, 'Item de custo não encontrado.', 404);
          p.itens_custo.splice(idx, 1); recalcular(p); p.atualizado_em = agora();
          return completo(db, p);
        }
      }
    }

    if (r0 === 'estoque') {
      if (r1_ === 'movimentacoes' && !r2_ && metodo === 'GET') {
        let l = movsOrdenadas(db);
        if (q.get('produto_id')) l = l.filter((x) => x.produto_id === Number(q.get('produto_id')));
        if (q.get('tipo')) l = l.filter((x) => x.tipo === q.get('tipo'));
        return l.slice(0, Math.min(Number(q.get('limite')) || 200, 2000)).map((x) => movSaida(db, x));
      }
      if (r1_ === 'movimentacoes' && r2_ && metodo === 'DELETE') {
        const idx = db.movs.findIndex((x) => x.id === Number(r2_));
        exigir(idx >= 0, 'Movimentação não encontrada.', 404);
        db.movs.splice(idx, 1);
        return null;
      }
      if (r1_ === 'produtos' && r3 === 'movimentar' && metodo === 'POST') {
        const p = produto(db, r2_);
        const d = body || {};
        exigir(['entrada', 'saida', 'ajuste'].includes(d.tipo), 'Tipo de movimentação inválido.');
        const qtd = inteiro(d.quantidade, 'Quantidade');
        if (d.tipo === 'entrada') p.quantidade_estoque += qtd;
        else if (d.tipo === 'saida') {
          exigir(qtd <= p.quantidade_estoque, `Estoque insuficiente: há ${p.quantidade_estoque} unidade(s).`);
          p.quantidade_estoque -= qtd;
        } else p.quantidade_estoque = qtd;
        p.atualizado_em = agora();
        registrarMov(db, p, { tipo: d.tipo, quantidade: qtd, motivo: opcional(d.motivo), observacao: opcional(d.observacao), ...(d.data ? { data: new Date(d.data).toISOString() } : {}) });
        return movSaida(db, db.movs[db.movs.length - 1]);
      }
    }

    falha(404, 'Não encontrado.');
  }

  // ---------- exportação (CSV e Excel) ----------
  const pct = (p) => (p.preco_venda ? r1((p.preco_venda - p.custo_producao) / p.preco_venda * 100) : '');
  function linhasProdutos(db) {
    const cab = ['Código', 'Peça', 'Coleção/Capítulo', 'Categoria', 'Tamanho', 'Cor', 'Estoque', 'Estoque mínimo', 'Custo de produção (R$)', 'Preço de venda (R$)', 'Margem (R$)', 'Margem (%)', 'Ativo'];
    return [cab, ...ordenarPor([...db.produtos], 'nome').map((p) => [
      p.codigo || '', p.nome, nomeDe(db.colecoes, p.colecao_id) || '', nomeDe(db.categorias, p.categoria_id) || '', p.tamanho || '', p.cor || '',
      p.quantidade_estoque, p.estoque_minimo, r2(p.custo_producao), r2(p.preco_venda), r2(p.preco_venda - p.custo_producao), pct(p), p.ativo ? 'Sim' : 'Não',
      ...Object.entries(p.campos_extras || {}).map(([k, v]) => `${k}: ${v}`),
    ])];
  }
  function linhasCustos(db) {
    const linhas = [['Código', 'Peça', 'Grupo de custo', 'Item', 'Unidade', 'Quantidade', 'Valor unitário (R$)', 'Valor total (R$)']];
    for (const p of ordenarPor([...db.produtos], 'nome')) {
      const itens = ordenarPor([...p.itens_custo], 'ordem', 'id');
      for (const i of itens) linhas.push([p.codigo || '', p.nome, grupoDoItem(db, i) || '', i.descricao, i.unidade, i.quantidade, r2(i.valor_unitario), r2(i.valor_total)]);
      if (itens.length) linhas.push([p.codigo || '', p.nome, '', 'CUSTO TOTAL DA PEÇA', '', '', '', r2(p.custo_producao)]);
    }
    return linhas;
  }
  function linhasInsumos(db) {
    return [['Insumo', 'Grupo', 'Unidade', 'Custo unitário (R$)', 'Fornecedor', 'Observações', 'Ativo'],
      ...ordenarPor([...db.insumos], 'nome').map((i) => [i.nome, nomeDe(db.grupos, i.categoria_id) || '', i.unidade, r2(i.custo_unitario), i.fornecedor || '', i.observacoes || '', i.ativo ? 'Sim' : 'Não'])];
  }
  const PLANILHAS = { produtos: linhasProdutos, custos: linhasCustos, insumos: linhasInsumos };
  const nomeArquivo = (base, ext) => `gilda_${base}_${new Date().toLocaleDateString('sv-SE')}.${ext}`;

  function baixar(blob, nome) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportarCsv(tipo) {
    const db = carregar();
    const celula = (v) => {
      const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + PLANILHAS[tipo](db).map((l) => l.map(celula).join(';')).join('\n') + '\n'; // BOM para o Excel ler acentos
    baixar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), nomeArquivo(tipo, 'csv'));
  }

  let xlsxPromessa = null;
  function carregarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    xlsxPromessa = xlsxPromessa || new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = () => res(window.XLSX);
      s.onerror = () => { xlsxPromessa = null; rej(new Error('Não foi possível carregar o gerador de Excel. Verifique a internet.')); };
      document.head.appendChild(s);
    });
    return xlsxPromessa;
  }
  async function exportarXlsx() {
    const XLSX = await carregarXlsx();
    const db = carregar();
    const wb = XLSX.utils.book_new();
    for (const [titulo, gerar] of [['Peças', linhasProdutos], ['Composição de custos', linhasCustos], ['Insumos', linhasInsumos]]) {
      const linhas = gerar(db);
      const ws = XLSX.utils.aoa_to_sheet(linhas);
      const ncol = Math.max(...linhas.map((l) => l.length));
      ws['!cols'] = Array.from({ length: ncol }, (_, c) => ({ wch: Math.min(Math.max(12, Math.max(...linhas.map((l) => String(l[c] ?? '').length)) + 2), 50) }));
      XLSX.utils.book_append_sheet(wb, ws, titulo);
    }
    XLSX.writeFile(wb, nomeArquivo('completo', 'xlsx'));
  }

  // ---------- API pública ----------
  return {
    async request(metodo, url, body) {
      const db = carregar();
      const resultado = rotear(db, metodo.toUpperCase(), url, body === undefined ? undefined : clone(body));
      if (metodo.toUpperCase() !== 'GET') gravar(db);
      return resultado === null || resultado === undefined ? null : clone(resultado);
    },
    async exportar(arquivo) {
      if (arquivo === 'completo.xlsx') return exportarXlsx();
      const tipo = arquivo.replace(/\.csv$/, '');
      if (!PLANILHAS[tipo]) throw new Error('Tipo de exportação inválido.');
      exportarCsv(tipo);
    },
    backup() {
      baixar(new Blob([JSON.stringify(carregar(), null, 2)], { type: 'application/json' }), nomeArquivo('backup', 'json'));
    },
    restaurar(textoJson) {
      let d;
      try { d = JSON.parse(textoJson); } catch { throw new Error('Arquivo de backup inválido.'); }
      const tabelas = ['colecoes', 'categorias', 'opcoes', 'campos', 'grupos', 'insumos', 'produtos', 'movs'];
      if (!d || typeof d.seq !== 'object' || !tabelas.every((t) => Array.isArray(d[t]))) throw new Error('Esse arquivo não é um backup do GILDA;.');
      gravar(d);
    },
    get persistente() { carregar(); return !semStorage; },
  };
})();
