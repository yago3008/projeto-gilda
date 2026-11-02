"""Catálogo de insumos (tecidos, aviamentos, mão de obra, embalagens...)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import usuario_logado
from ..database import get_db

router = APIRouter(prefix="/api/insumos", tags=["insumos"], dependencies=[Depends(usuario_logado)])


def _out(db: Session, ins: models.Insumo) -> dict:
    data = schemas.InsumoOut.model_validate(ins).model_dump()
    data["categoria_nome"] = ins.categoria.nome if ins.categoria else None
    data["usado_em"] = db.scalar(
        select(func.count(func.distinct(models.ItemCusto.produto_id))).where(models.ItemCusto.insumo_id == ins.id)
    ) or 0
    return data


@router.get("", response_model=list[schemas.InsumoOut])
def listar(
    q: str | None = Query(None, description="Busca por nome ou fornecedor"),
    categoria_id: int | None = None,
    somente_ativos: bool = False,
    db: Session = Depends(get_db),
):
    stmt = select(models.Insumo)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(models.Insumo.nome.ilike(like), models.Insumo.fornecedor.ilike(like)))
    if categoria_id:
        stmt = stmt.where(models.Insumo.categoria_id == categoria_id)
    if somente_ativos:
        stmt = stmt.where(models.Insumo.ativo.is_(True))
    stmt = stmt.order_by(models.Insumo.nome)
    return [_out(db, i) for i in db.scalars(stmt).all()]


@router.post("", response_model=schemas.InsumoOut, status_code=201)
def criar(dados: schemas.InsumoIn, db: Session = Depends(get_db)):
    ins = models.Insumo(**dados.model_dump())
    db.add(ins)
    db.commit()
    db.refresh(ins)
    return _out(db, ins)


@router.get("/{insumo_id}", response_model=schemas.InsumoOut)
def obter(insumo_id: int, db: Session = Depends(get_db)):
    ins = db.get(models.Insumo, insumo_id)
    if not ins:
        raise HTTPException(404, "Insumo não encontrado.")
    return _out(db, ins)


@router.put("/{insumo_id}", response_model=schemas.InsumoOut)
def editar(
    insumo_id: int,
    dados: schemas.InsumoIn,
    atualizar_composicoes: bool = Query(False, description="Atualiza o valor unitário nas composições que usam este insumo"),
    db: Session = Depends(get_db),
):
    ins = db.get(models.Insumo, insumo_id)
    if not ins:
        raise HTTPException(404, "Insumo não encontrado.")
    for k, v in dados.model_dump().items():
        setattr(ins, k, v)
    if atualizar_composicoes:
        itens = db.scalars(select(models.ItemCusto).where(models.ItemCusto.insumo_id == ins.id)).all()
        produtos = set()
        for item in itens:
            item.valor_unitario = ins.custo_unitario
            item.unidade = ins.unidade
            item.calcular()
            produtos.add(item.produto)
        for p in produtos:
            p.recalcular_custo()
    db.commit()
    db.refresh(ins)
    return _out(db, ins)


@router.delete("/{insumo_id}", status_code=204)
def excluir(insumo_id: int, db: Session = Depends(get_db)):
    ins = db.get(models.Insumo, insumo_id)
    if not ins:
        raise HTTPException(404, "Insumo não encontrado.")
    db.delete(ins)  # itens de custo mantêm a descrição e valores, só perdem o vínculo
    db.commit()
    return None
