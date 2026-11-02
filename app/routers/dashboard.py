"""Resumo geral para a tela inicial."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..auth import usuario_logado
from ..database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(usuario_logado)])


@router.get("")
def resumo(db: Session = Depends(get_db)):
    P = models.Produto
    ativos = select(P).where(P.ativo.is_(True))
    produtos = db.scalars(ativos).all()

    total_pecas = len(produtos)
    unidades = sum(p.quantidade_estoque for p in produtos)
    valor_custo = round(sum(p.quantidade_estoque * p.custo_producao for p in produtos), 2)
    valor_venda = round(sum(p.quantidade_estoque * p.preco_venda for p in produtos), 2)
    com_preco = [p for p in produtos if p.preco_venda]
    margem_media = round(sum((p.preco_venda - p.custo_producao) / p.preco_venda for p in com_preco) / len(com_preco) * 100, 1) if com_preco else None

    estoque_baixo = [
        {"id": p.id, "nome": p.nome, "tamanho": p.tamanho, "cor": p.cor, "quantidade_estoque": p.quantidade_estoque, "estoque_minimo": p.estoque_minimo}
        for p in sorted(produtos, key=lambda x: x.quantidade_estoque)
        if p.quantidade_estoque <= p.estoque_minimo
    ][:10]

    sem_composicao = [{"id": p.id, "nome": p.nome} for p in produtos if not p.itens_custo][:10]

    # custo total (por unidade em estoque) agrupado por categoria de insumo
    rows = db.execute(
        select(
            func.coalesce(models.CategoriaInsumo.nome, "Sem categoria").label("categoria"),
            func.sum(models.ItemCusto.valor_total * P.quantidade_estoque).label("total_estoque"),
            func.sum(models.ItemCusto.valor_total).label("total_unitario"),
        )
        .select_from(models.ItemCusto)
        .join(P, P.id == models.ItemCusto.produto_id)
        .outerjoin(models.CategoriaInsumo, models.CategoriaInsumo.id == models.ItemCusto.categoria_insumo_id)
        .where(P.ativo.is_(True))
        .group_by("categoria")
        .order_by(func.sum(models.ItemCusto.valor_total).desc())
    ).all()
    custo_por_categoria = [
        {"categoria": r.categoria, "total_estoque": round(r.total_estoque or 0, 2), "total_unitario": round(r.total_unitario or 0, 2)} for r in rows
    ]

    por_categoria = db.execute(
        select(func.coalesce(models.Categoria.nome, "Sem categoria"), func.count(P.id), func.sum(P.quantidade_estoque))
        .select_from(P)
        .outerjoin(models.Categoria, models.Categoria.id == P.categoria_id)
        .where(P.ativo.is_(True))
        .group_by(models.Categoria.nome)
        .order_by(func.count(P.id).desc())
    ).all()

    por_colecao = db.execute(
        select(func.coalesce(models.Colecao.nome, "Sem coleção"), func.count(P.id), func.sum(P.quantidade_estoque))
        .select_from(P)
        .outerjoin(models.Colecao, models.Colecao.id == P.colecao_id)
        .where(P.ativo.is_(True))
        .group_by(models.Colecao.nome)
        .order_by(func.count(P.id).desc())
    ).all()

    # uma linha por modelo (variações de tamanho/cor da mesma peça costumam ter a mesma margem)
    por_nome = {}
    for p in com_preco:
        por_nome.setdefault(p.nome, p)
    unicos = list(por_nome.values())
    margem = lambda p: (p.preco_venda - p.custo_producao) / p.preco_venda  # noqa: E731
    melhores_margens = sorted(unicos, key=margem, reverse=True)[:5]
    piores_margens = sorted(unicos, key=margem)[:5]

    def _m(p):
        return {
            "id": p.id, "nome": p.nome, "preco_venda": p.preco_venda, "custo_producao": p.custo_producao,
            "margem_percentual": round((p.preco_venda - p.custo_producao) / p.preco_venda * 100, 1),
        }

    ultimas = db.scalars(
        select(models.MovimentacaoEstoque).order_by(models.MovimentacaoEstoque.data.desc(), models.MovimentacaoEstoque.id.desc()).limit(8)
    ).all()

    return {
        "total_pecas": total_pecas,
        "unidades_estoque": unidades,
        "valor_estoque_custo": valor_custo,
        "valor_estoque_venda": valor_venda,
        "lucro_potencial": round(valor_venda - valor_custo, 2),
        "margem_media": margem_media,
        "total_insumos": db.scalar(select(func.count(models.Insumo.id))) or 0,
        "estoque_baixo": estoque_baixo,
        "sem_composicao": sem_composicao,
        "custo_por_categoria": custo_por_categoria,
        "pecas_por_categoria": [{"nome": n, "pecas": c, "unidades": u or 0} for n, c, u in por_categoria],
        "pecas_por_colecao": [{"nome": n, "pecas": c, "unidades": u or 0} for n, c, u in por_colecao],
        "melhores_margens": [_m(p) for p in melhores_margens],
        "piores_margens": [_m(p) for p in piores_margens],
        "ultimas_movimentacoes": [
            {"id": m.id, "produto_id": m.produto_id, "produto_nome": m.produto.nome if m.produto else None, "tipo": m.tipo,
             "quantidade": m.quantidade, "motivo": m.motivo, "data": m.data.isoformat(), "estoque_resultante": m.estoque_resultante}
            for m in ultimas
        ],
    }
