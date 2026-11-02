"""Movimentação de estoque com histórico."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import usuario_logado
from ..database import get_db

router = APIRouter(prefix="/api/estoque", tags=["estoque"], dependencies=[Depends(usuario_logado)])


def _out(m: models.MovimentacaoEstoque) -> dict:
    d = schemas.MovimentacaoOut.model_validate(m).model_dump()
    d["produto_nome"] = m.produto.nome if m.produto else None
    return d


@router.get("/movimentacoes", response_model=list[schemas.MovimentacaoOut])
def listar(
    produto_id: int | None = None,
    tipo: str | None = None,
    limite: int = Query(200, le=2000),
    db: Session = Depends(get_db),
):
    stmt = select(models.MovimentacaoEstoque)
    if produto_id:
        stmt = stmt.where(models.MovimentacaoEstoque.produto_id == produto_id)
    if tipo:
        stmt = stmt.where(models.MovimentacaoEstoque.tipo == tipo)
    stmt = stmt.order_by(models.MovimentacaoEstoque.data.desc(), models.MovimentacaoEstoque.id.desc()).limit(limite)
    return [_out(m) for m in db.scalars(stmt).all()]


@router.post("/produtos/{produto_id}/movimentar", response_model=schemas.MovimentacaoOut, status_code=201)
def movimentar(produto_id: int, dados: schemas.MovimentacaoIn, db: Session = Depends(get_db)):
    p = db.get(models.Produto, produto_id)
    if not p:
        raise HTTPException(404, "Peça não encontrada.")
    if dados.tipo == "entrada":
        p.quantidade_estoque += dados.quantidade
    elif dados.tipo == "saida":
        if dados.quantidade > p.quantidade_estoque:
            raise HTTPException(422, f"Estoque insuficiente: há {p.quantidade_estoque} unidade(s).")
        p.quantidade_estoque -= dados.quantidade
    else:  # ajuste: a quantidade informada passa a ser o estoque atual
        p.quantidade_estoque = dados.quantidade
    mov = models.MovimentacaoEstoque(
        produto=p,
        tipo=dados.tipo,
        quantidade=dados.quantidade,
        motivo=dados.motivo,
        observacao=dados.observacao,
        data=dados.data or datetime.utcnow(),
        estoque_resultante=p.quantidade_estoque,
    )
    db.add(mov)
    db.commit()
    db.refresh(mov)
    return _out(mov)


@router.delete("/movimentacoes/{mov_id}", status_code=204)
def excluir(mov_id: int, db: Session = Depends(get_db)):
    """Exclui só o registro histórico (não desfaz a alteração no estoque)."""
    mov = db.get(models.MovimentacaoEstoque, mov_id)
    if not mov:
        raise HTTPException(404, "Movimentação não encontrada.")
    db.delete(mov)
    db.commit()
    return None
