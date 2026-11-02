"""Cadastros auxiliares: coleções, categorias, opções, campos personalizados e categorias de insumo.

Um helper genérico faz o CRUD para não repetir código; cada entidade só declara
o modelo, os esquemas e como contar o uso (para avisar antes de excluir).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import usuario_logado
from ..database import get_db

router = APIRouter(prefix="/api", tags=["cadastros"], dependencies=[Depends(usuario_logado)])


def _crud(prefix: str, Model, SchemaIn, SchemaOut, contagem=None, order_by=None, extra_filter=None):
    def _serializar(db: Session, obj):
        data = SchemaOut.model_validate(obj).model_dump()
        if contagem is not None:
            data[contagem[0]] = db.scalar(contagem[1](obj.id)) or 0
        return data

    @router.get(f"/{prefix}", response_model=list[SchemaOut], name=f"listar_{prefix}")
    def listar(db: Session = Depends(get_db)):
        stmt = select(Model)
        if order_by is not None:
            stmt = stmt.order_by(*order_by)
        return [_serializar(db, o) for o in db.scalars(stmt).all()]

    @router.post(f"/{prefix}", response_model=SchemaOut, status_code=201, name=f"criar_{prefix}")
    def criar(dados: SchemaIn, db: Session = Depends(get_db)):
        obj = Model(**dados.model_dump())
        db.add(obj)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Já existe um registro com esse nome.")
        db.refresh(obj)
        return _serializar(db, obj)

    @router.put(f"/{prefix}/{{item_id}}", response_model=SchemaOut, name=f"editar_{prefix}")
    def editar(item_id: int, dados: SchemaIn, db: Session = Depends(get_db)):
        obj = db.get(Model, item_id)
        if not obj:
            raise HTTPException(404, "Registro não encontrado.")
        for k, v in dados.model_dump().items():
            setattr(obj, k, v)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Já existe um registro com esse nome.")
        db.refresh(obj)
        return _serializar(db, obj)

    @router.delete(f"/{prefix}/{{item_id}}", status_code=204, name=f"excluir_{prefix}")
    def excluir(item_id: int, db: Session = Depends(get_db)):
        obj = db.get(Model, item_id)
        if not obj:
            raise HTTPException(404, "Registro não encontrado.")
        db.delete(obj)
        db.commit()
        return None


_crud(
    "colecoes",
    models.Colecao,
    schemas.ColecaoIn,
    schemas.ColecaoOut,
    contagem=("total_produtos", lambda cid: select(func.count(models.Produto.id)).where(models.Produto.colecao_id == cid)),
    order_by=[models.Colecao.ano.desc().nulls_last(), models.Colecao.nome],
)
_crud(
    "categorias",
    models.Categoria,
    schemas.CategoriaIn,
    schemas.CategoriaOut,
    contagem=("total_produtos", lambda cid: select(func.count(models.Produto.id)).where(models.Produto.categoria_id == cid)),
    order_by=[models.Categoria.nome],
)
_crud("opcoes", models.Opcao, schemas.OpcaoIn, schemas.OpcaoOut, order_by=[models.Opcao.tipo, models.Opcao.ordem, models.Opcao.valor])
_crud("campos", models.CampoPersonalizado, schemas.CampoIn, schemas.CampoOut, order_by=[models.CampoPersonalizado.ordem, models.CampoPersonalizado.id])
_crud(
    "categorias-insumo",
    models.CategoriaInsumo,
    schemas.CategoriaInsumoIn,
    schemas.CategoriaInsumoOut,
    contagem=("total_insumos", lambda cid: select(func.count(models.Insumo.id)).where(models.Insumo.categoria_id == cid)),
    order_by=[models.CategoriaInsumo.ordem, models.CategoriaInsumo.nome],
)
