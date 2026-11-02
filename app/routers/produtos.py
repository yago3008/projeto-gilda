"""Peças/produtos e a composição de custo de cada uma."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..auth import usuario_logado
from ..database import get_db

router = APIRouter(prefix="/api/produtos", tags=["produtos"], dependencies=[Depends(usuario_logado)])


def _margem(p: models.Produto) -> tuple[float, float | None]:
    valor = round((p.preco_venda or 0) - (p.custo_producao or 0), 2)
    pct = round(valor / p.preco_venda * 100, 1) if p.preco_venda else None
    return valor, pct


def _resumo(p: models.Produto) -> dict:
    data = schemas.ProdutoResumo.model_validate(p).model_dump()
    data["colecao_nome"] = p.colecao.nome if p.colecao else None
    data["categoria_nome"] = p.categoria.nome if p.categoria else None
    data["margem_valor"], data["margem_percentual"] = _margem(p)
    return data


def _item_out(i: models.ItemCusto) -> dict:
    d = schemas.ItemCustoOut.model_validate(i).model_dump()
    cat = i.categoria_insumo or (i.insumo.categoria if i.insumo else None)
    d["categoria_insumo_nome"] = cat.nome if cat else None
    return d


def _completo(p: models.Produto) -> dict:
    data = _resumo(p)
    data.update(
        descricao=p.descricao,
        campos_extras=p.campos_extras or {},
        criado_em=p.criado_em,
        itens_custo=[_item_out(i) for i in p.itens_custo],
    )
    return data


def _validar_campos_extras(db: Session, valores: dict) -> dict:
    campos = db.scalars(select(models.CampoPersonalizado).where(models.CampoPersonalizado.ativo.is_(True))).all()
    limpos = {}
    for c in campos:
        v = valores.get(c.chave)
        if v in (None, "") and c.obrigatorio:
            raise HTTPException(422, f"O campo '{c.rotulo}' é obrigatório.")
        if v in (None, ""):
            continue
        if c.tipo == "numero":
            try:
                v = float(v)
            except (TypeError, ValueError):
                raise HTTPException(422, f"O campo '{c.rotulo}' precisa ser numérico.")
        elif c.tipo == "booleano":
            v = bool(v) if not isinstance(v, str) else v.lower() in ("1", "true", "sim")
        elif c.tipo == "lista" and c.opcoes and v not in c.opcoes:
            raise HTTPException(422, f"Valor inválido para '{c.rotulo}'.")
        limpos[c.chave] = v
    return limpos


def _aplicar_itens(db: Session, produto: models.Produto, itens: list[schemas.ItemCustoIn]):
    produto.itens_custo.clear()
    for idx, it in enumerate(itens):
        dados = it.model_dump()
        insumo = db.get(models.Insumo, dados["insumo_id"]) if dados.get("insumo_id") else None
        if insumo and not dados.get("categoria_insumo_id"):
            dados["categoria_insumo_id"] = insumo.categoria_id
        item = models.ItemCusto(**dados)
        item.ordem = idx
        item.calcular()
        produto.itens_custo.append(item)
    produto.recalcular_custo()


def _carregar(db: Session, produto_id: int) -> models.Produto:
    p = db.scalar(
        select(models.Produto)
        .options(selectinload(models.Produto.itens_custo).selectinload(models.ItemCusto.insumo))
        .where(models.Produto.id == produto_id)
    )
    if not p:
        raise HTTPException(404, "Peça não encontrada.")
    return p


@router.get("", response_model=list[schemas.ProdutoResumo])
def listar(
    q: str | None = None,
    colecao_id: int | None = None,
    categoria_id: int | None = None,
    tamanho: str | None = None,
    cor: str | None = None,
    somente_ativos: bool = False,
    estoque_baixo: bool = False,
    ordenar: str = Query("nome", pattern="^(nome|codigo|preco_venda|custo_producao|quantidade_estoque|atualizado_em)$"),
    direcao: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    stmt = select(models.Produto)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(models.Produto.nome.ilike(like), models.Produto.codigo.ilike(like), models.Produto.cor.ilike(like)))
    if colecao_id:
        stmt = stmt.where(models.Produto.colecao_id == colecao_id)
    if categoria_id:
        stmt = stmt.where(models.Produto.categoria_id == categoria_id)
    if tamanho:
        stmt = stmt.where(models.Produto.tamanho == tamanho)
    if cor:
        stmt = stmt.where(models.Produto.cor == cor)
    if somente_ativos:
        stmt = stmt.where(models.Produto.ativo.is_(True))
    if estoque_baixo:
        stmt = stmt.where(models.Produto.quantidade_estoque <= models.Produto.estoque_minimo)
    col = getattr(models.Produto, ordenar)
    stmt = stmt.order_by(col.desc() if direcao == "desc" else col.asc())
    return [_resumo(p) for p in db.scalars(stmt).all()]


@router.post("", response_model=schemas.ProdutoOut, status_code=201)
def criar(dados: schemas.ProdutoIn, db: Session = Depends(get_db)):
    payload = dados.model_dump(exclude={"itens_custo"})
    payload["campos_extras"] = _validar_campos_extras(db, payload.get("campos_extras") or {})
    if payload.get("codigo") == "":
        payload["codigo"] = None
    p = models.Produto(**payload)
    db.add(p)
    _aplicar_itens(db, p, dados.itens_custo or [])
    if p.quantidade_estoque:
        db.add(
            models.MovimentacaoEstoque(
                produto=p, tipo="entrada", quantidade=p.quantidade_estoque, motivo="cadastro inicial", estoque_resultante=p.quantidade_estoque
            )
        )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Já existe uma peça com esse código.")
    return _completo(_carregar(db, p.id))


@router.get("/{produto_id}", response_model=schemas.ProdutoOut)
def obter(produto_id: int, db: Session = Depends(get_db)):
    return _completo(_carregar(db, produto_id))


@router.put("/{produto_id}", response_model=schemas.ProdutoOut)
def editar(produto_id: int, dados: schemas.ProdutoIn, db: Session = Depends(get_db)):
    p = _carregar(db, produto_id)
    payload = dados.model_dump(exclude={"itens_custo"})
    payload["campos_extras"] = _validar_campos_extras(db, payload.get("campos_extras") or {})
    if payload.get("codigo") == "":
        payload["codigo"] = None
    estoque_anterior = p.quantidade_estoque
    for k, v in payload.items():
        setattr(p, k, v)
    if p.quantidade_estoque != estoque_anterior:
        diff = p.quantidade_estoque - estoque_anterior
        db.add(
            models.MovimentacaoEstoque(
                produto=p, tipo="ajuste", quantidade=abs(diff), motivo="edição do cadastro",
                observacao=f"De {estoque_anterior} para {p.quantidade_estoque}", estoque_resultante=p.quantidade_estoque,
            )
        )
    if dados.itens_custo is not None:
        _aplicar_itens(db, p, dados.itens_custo)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Já existe uma peça com esse código.")
    return _completo(_carregar(db, p.id))


@router.post("/{produto_id}/duplicar", response_model=schemas.ProdutoOut, status_code=201)
def duplicar(produto_id: int, db: Session = Depends(get_db)):
    """Cria uma cópia da peça (útil para variações de tamanho/cor com a mesma composição)."""
    orig = _carregar(db, produto_id)
    novo = models.Produto(
        nome=f"{orig.nome} (cópia)", codigo=None, colecao_id=orig.colecao_id, categoria_id=orig.categoria_id,
        tamanho=orig.tamanho, cor=orig.cor, quantidade_estoque=0, estoque_minimo=orig.estoque_minimo,
        preco_venda=orig.preco_venda, descricao=orig.descricao, campos_extras=dict(orig.campos_extras or {}), ativo=orig.ativo,
    )
    db.add(novo)
    for i in orig.itens_custo:
        novo.itens_custo.append(
            models.ItemCusto(
                insumo_id=i.insumo_id, categoria_insumo_id=i.categoria_insumo_id, descricao=i.descricao, unidade=i.unidade,
                quantidade=i.quantidade, valor_unitario=i.valor_unitario, valor_total=i.valor_total, ordem=i.ordem,
            )
        )
    novo.recalcular_custo()
    db.commit()
    return _completo(_carregar(db, novo.id))


@router.delete("/{produto_id}", status_code=204)
def excluir(produto_id: int, db: Session = Depends(get_db)):
    p = _carregar(db, produto_id)
    db.delete(p)
    db.commit()
    return None


# ---------- Composição de custo (edição item a item) ----------
@router.get("/{produto_id}/custos", response_model=list[schemas.ItemCustoOut])
def listar_custos(produto_id: int, db: Session = Depends(get_db)):
    return [_item_out(i) for i in _carregar(db, produto_id).itens_custo]


@router.put("/{produto_id}/custos", response_model=schemas.ProdutoOut)
def substituir_custos(produto_id: int, itens: list[schemas.ItemCustoIn], db: Session = Depends(get_db)):
    p = _carregar(db, produto_id)
    _aplicar_itens(db, p, itens)
    db.commit()
    return _completo(_carregar(db, p.id))


@router.post("/{produto_id}/custos", response_model=schemas.ProdutoOut, status_code=201)
def adicionar_custo(produto_id: int, item: schemas.ItemCustoIn, db: Session = Depends(get_db)):
    p = _carregar(db, produto_id)
    dados = item.model_dump()
    insumo = db.get(models.Insumo, dados["insumo_id"]) if dados.get("insumo_id") else None
    if insumo and not dados.get("categoria_insumo_id"):
        dados["categoria_insumo_id"] = insumo.categoria_id
    novo = models.ItemCusto(**dados)
    novo.ordem = len(p.itens_custo)
    novo.calcular()
    p.itens_custo.append(novo)
    p.recalcular_custo()
    db.commit()
    return _completo(_carregar(db, p.id))


@router.delete("/{produto_id}/custos/{item_id}", response_model=schemas.ProdutoOut)
def remover_custo(produto_id: int, item_id: int, db: Session = Depends(get_db)):
    p = _carregar(db, produto_id)
    item = next((i for i in p.itens_custo if i.id == item_id), None)
    if not item:
        raise HTTPException(404, "Item de custo não encontrado.")
    p.itens_custo.remove(item)
    p.recalcular_custo()
    db.commit()
    return _completo(_carregar(db, p.id))
