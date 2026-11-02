"""Dados iniciais.

`popular_base()` cria os cadastros mínimos (categorias, grupos de custo, tamanhos, cores, unidades)
em qualquer instalação nova. `popular_exemplo()` adiciona peças e insumos fictícios, inspirados
na loja, para demonstração (controlado pela variável GILDA_SEED_EXEMPLO).
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models

CATEGORIAS = ["Camisas", "Calças", "Bermudas", "Lenços", "Vestidos", "Blazers"]
GRUPOS_CUSTO = ["Tecido", "Botões", "Zíperes", "Etiquetas", "Aviamentos", "Mão de obra", "Embalagem", "Sacola", "Outros"]
TAMANHOS = ["PP", "P", "M", "G", "GG", "Único"]
CORES = ["Off-white", "Creme", "Terracota", "Marrom", "Preto", "Mostarda", "Oliva", "Azul"]
UNIDADES = ["un", "m", "cm", "kg", "g", "par", "h", "rolo", "cone"]
MOTIVOS = ["produção", "venda", "devolução", "perda", "inventário", "ajuste"]


def _garantir(db: Session, Model, campo: str, valores, **extra):
    existentes = {getattr(o, campo) for o in db.scalars(select(Model)).all()}
    for ordem, v in enumerate(valores):
        if v not in existentes:
            db.add(Model(**{campo: v}, **({"ordem": ordem} if hasattr(Model, "ordem") else {}), **extra))
    db.flush()


def popular_base(db: Session):
    _garantir(db, models.Categoria, "nome", CATEGORIAS)
    _garantir(db, models.CategoriaInsumo, "nome", GRUPOS_CUSTO)
    for tipo, valores in (("tamanho", TAMANHOS), ("cor", CORES), ("unidade", UNIDADES), ("motivo", MOTIVOS)):
        existentes = {o.valor for o in db.scalars(select(models.Opcao).where(models.Opcao.tipo == tipo)).all()}
        for ordem, v in enumerate(valores):
            if v not in existentes:
                db.add(models.Opcao(tipo=tipo, valor=v, ordem=ordem))
    if not db.scalar(select(models.CampoPersonalizado).limit(1)):
        db.add_all(
            [
                models.CampoPersonalizado(chave="composicao_tecido", rotulo="Composição do tecido", tipo="texto", ordem=1),
                models.CampoPersonalizado(chave="modelagem", rotulo="Modelagem", tipo="lista", opcoes=["Reta", "Ampla", "Ajustada", "Oversized"], ordem=2),
                models.CampoPersonalizado(chave="tempo_producao_horas", rotulo="Tempo de produção (h)", tipo="numero", ordem=3),
            ]
        )
    db.commit()


def popular_exemplo(db: Session):
    if db.scalar(select(models.Produto).limit(1)):
        return  # já tem dados, não duplica

    cat = {c.nome: c for c in db.scalars(select(models.Categoria)).all()}
    grp = {g.nome: g for g in db.scalars(select(models.CategoriaInsumo)).all()}

    colecoes = {
        "Capítulo 1 · Origem": models.Colecao(nome="Capítulo 1 · Origem", ano=2025, descricao="Primeira coleção: releitura da alfaiataria clássica."),
        "Capítulo 2 · Ritual": models.Colecao(nome="Capítulo 2 · Ritual", ano=2026, descricao="Peças inspiradas em pequenos rituais do cotidiano brasileiro."),
    }
    db.add_all(colecoes.values())

    insumos_def = [
        ("Algodão egípcio off-white", "Tecido", "m", 68.0, "Tecelagem Aurora"),
        ("Linho misto terracota", "Tecido", "m", 74.0, "Tecelagem Aurora"),
        ("Sarja de algodão marrom", "Tecido", "m", 52.0, "Casa do Tecido"),
        ("Seda estampada", "Tecido", "m", 120.0, "Sedas Paraná"),
        ("Botão madrepérola 12mm", "Botões", "un", 1.9, "Aviamentos Centro"),
        ("Botão de coco 18mm", "Botões", "un", 1.4, "Aviamentos Centro"),
        ("Zíper invisível 20cm", "Zíperes", "un", 3.2, "Aviamentos Centro"),
        ("Etiqueta de composição", "Etiquetas", "un", 0.45, "Gráfica Têxtil"),
        ("Etiqueta bordada GILDA;", "Etiquetas", "un", 1.8, "Gráfica Têxtil"),
        ("Linha 120 (cone)", "Aviamentos", "cone", 9.5, "Aviamentos Centro"),
        ("Entretela leve", "Aviamentos", "m", 8.0, "Casa do Tecido"),
        ("Elástico 3cm", "Aviamentos", "m", 2.2, "Aviamentos Centro"),
        ("Costura (ateliê)", "Mão de obra", "h", 38.0, "Ateliê parceiro"),
        ("Corte", "Mão de obra", "h", 32.0, "Ateliê parceiro"),
        ("Acabamento e passadoria", "Mão de obra", "h", 30.0, "Ateliê parceiro"),
        ("Papel de seda", "Embalagem", "un", 0.9, "Embalagens Curitiba"),
        ("Caixa kraft", "Embalagem", "un", 4.6, "Embalagens Curitiba"),
        ("Sacola de algodão GILDA;", "Sacola", "un", 7.5, "Embalagens Curitiba"),
        ("Cartão de agradecimento", "Embalagem", "un", 0.7, "Gráfica Têxtil"),
    ]
    insumos = {}
    for nome, grupo, un, custo, forn in insumos_def:
        i = models.Insumo(nome=nome, categoria=grp[grupo], unidade=un, custo_unitario=custo, fornecedor=forn)
        insumos[nome] = i
        db.add(i)
    db.flush()

    def peca(nome, codigo, colecao, categoria, tamanho, cor, estoque, minimo, preco, descricao, itens, extras=None):
        p = models.Produto(
            nome=nome, codigo=codigo, colecao=colecoes[colecao], categoria=cat[categoria], tamanho=tamanho, cor=cor,
            quantidade_estoque=estoque, estoque_minimo=minimo, preco_venda=preco, descricao=descricao, campos_extras=extras or {},
        )
        for ordem, (ins_nome, qtd) in enumerate(itens):
            ins = insumos[ins_nome]
            item = models.ItemCusto(
                insumo=ins, categoria_insumo_id=ins.categoria_id, descricao=ins.nome, unidade=ins.unidade,
                quantidade=qtd, valor_unitario=ins.custo_unitario, ordem=ordem,
            )
            item.calcular()
            p.itens_custo.append(item)
        p.recalcular_custo()
        db.add(p)
        if estoque:
            db.add(models.MovimentacaoEstoque(produto=p, tipo="entrada", quantidade=estoque, motivo="produção", estoque_resultante=estoque))
        return p

    camisa = [
        ("Algodão egípcio off-white", 1.8), ("Botão madrepérola 12mm", 9), ("Etiqueta de composição", 1), ("Etiqueta bordada GILDA;", 1),
        ("Linha 120 (cone)", 0.15), ("Entretela leve", 0.3), ("Corte", 0.5), ("Costura (ateliê)", 2.5), ("Acabamento e passadoria", 0.5),
        ("Papel de seda", 2), ("Caixa kraft", 1), ("Sacola de algodão GILDA;", 1), ("Cartão de agradecimento", 1),
    ]
    for tam, est in (("PP", 3), ("P", 5), ("M", 4), ("G", 2), ("GG", 0)):
        peca(
            "Camisa Grão", f"CAM-GRAO-OW-{tam}", "Capítulo 2 · Ritual", "Camisas", tam, "Off-white", est, 2, 429.0,
            "Releitura da camisaria clássica com punho duplo. Algodão egípcio.", camisa,
            {"composicao_tecido": "100% algodão egípcio", "modelagem": "Ampla", "tempo_producao_horas": 3.5},
        )
    peca(
        "Camisa Casulo", "CAM-CASULO-TE-M", "Capítulo 2 · Ritual", "Camisas", "M", "Terracota", 3, 2, 399.0,
        "Camisa de linho misto com modelagem envolvente.",
        [("Linho misto terracota", 1.7), ("Botão de coco 18mm", 7), ("Etiqueta de composição", 1), ("Etiqueta bordada GILDA;", 1),
         ("Linha 120 (cone)", 0.15), ("Corte", 0.5), ("Costura (ateliê)", 2.2), ("Acabamento e passadoria", 0.5),
         ("Papel de seda", 2), ("Caixa kraft", 1), ("Sacola de algodão GILDA;", 1)],
        {"composicao_tecido": "55% linho, 45% algodão", "modelagem": "Oversized", "tempo_producao_horas": 3.2},
    )
    calca = [
        ("Sarja de algodão marrom", 1.6), ("Zíper invisível 20cm", 1), ("Botão de coco 18mm", 1), ("Etiqueta de composição", 1),
        ("Etiqueta bordada GILDA;", 1), ("Linha 120 (cone)", 0.2), ("Entretela leve", 0.2), ("Corte", 0.6), ("Costura (ateliê)", 3.0),
        ("Acabamento e passadoria", 0.6), ("Papel de seda", 2), ("Caixa kraft", 1), ("Sacola de algodão GILDA;", 1),
    ]
    for tam, est in (("P", 2), ("M", 4), ("G", 1)):
        peca("Calça Torra", f"CAL-TORRA-MR-{tam}", "Capítulo 1 · Origem", "Calças", tam, "Marrom", est, 2, 569.0,
             "Calça de alfaiataria com pregas e cintura alta.", calca,
             {"composicao_tecido": "100% algodão", "modelagem": "Reta", "tempo_producao_horas": 4.2})
    bermuda = [
        ("Linho misto terracota", 1.1), ("Zíper invisível 20cm", 1), ("Botão de coco 18mm", 1), ("Elástico 3cm", 0.4),
        ("Etiqueta de composição", 1), ("Etiqueta bordada GILDA;", 1), ("Linha 120 (cone)", 0.1), ("Corte", 0.4),
        ("Costura (ateliê)", 2.0), ("Acabamento e passadoria", 0.4), ("Papel de seda", 1), ("Caixa kraft", 1), ("Sacola de algodão GILDA;", 1),
    ]
    for tam, est in (("P", 3), ("M", 3), ("G", 2)):
        peca("Bermuda Envolto", f"BER-ENV-TE-{tam}", "Capítulo 2 · Ritual", "Bermudas", tam, "Terracota", est, 1, 415.0,
             "Bermuda de pregas com cós envolvente.", bermuda,
             {"composicao_tecido": "55% linho, 45% algodão", "modelagem": "Ampla", "tempo_producao_horas": 2.8})
    lenco = [
        ("Seda estampada", 0.5), ("Etiqueta de composição", 1), ("Linha 120 (cone)", 0.05), ("Corte", 0.15),
        ("Costura (ateliê)", 0.5), ("Papel de seda", 1), ("Sacola de algodão GILDA;", 1), ("Cartão de agradecimento", 1),
    ]
    peca("Lenço Manacá", "LEN-MANACA-UN", "Capítulo 2 · Ritual", "Lenços", "Único", "Terracota", 12, 3, 127.0,
         "Lenço de seda com estampa exclusiva.", lenco, {"composicao_tecido": "100% seda"})
    peca("Lenço Oitenta-e-oito", "LEN-88-UN", "Capítulo 1 · Origem", "Lenços", "Único", "Mostarda", 0, 3, 127.0,
         "Lenço de seda com estampa geométrica.", lenco, {"composicao_tecido": "100% seda"})
    db.commit()
