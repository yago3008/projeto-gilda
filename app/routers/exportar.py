"""Exportação de produtos, composição de custos e insumos em CSV e Excel."""
import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import models
from ..auth import usuario_logado
from ..database import get_db

router = APIRouter(prefix="/api/exportar", tags=["exportar"], dependencies=[Depends(usuario_logado)])

COLS_PRODUTO = [
    ("Código", lambda p: p.codigo or ""),
    ("Peça", lambda p: p.nome),
    ("Coleção/Capítulo", lambda p: p.colecao.nome if p.colecao else ""),
    ("Categoria", lambda p: p.categoria.nome if p.categoria else ""),
    ("Tamanho", lambda p: p.tamanho or ""),
    ("Cor", lambda p: p.cor or ""),
    ("Estoque", lambda p: p.quantidade_estoque),
    ("Estoque mínimo", lambda p: p.estoque_minimo),
    ("Custo de produção (R$)", lambda p: round(p.custo_producao, 2)),
    ("Preço de venda (R$)", lambda p: round(p.preco_venda, 2)),
    ("Margem (R$)", lambda p: round(p.preco_venda - p.custo_producao, 2)),
    ("Margem (%)", lambda p: round((p.preco_venda - p.custo_producao) / p.preco_venda * 100, 1) if p.preco_venda else ""),
    ("Ativo", lambda p: "Sim" if p.ativo else "Não"),
]

def _grupo(i: models.ItemCusto) -> str:
    cat = i.categoria_insumo or (i.insumo.categoria if i.insumo else None)
    return cat.nome if cat else ""


COLS_CUSTO = [
    ("Código", lambda p, i: p.codigo or ""),
    ("Peça", lambda p, i: p.nome),
    ("Grupo de custo", lambda p, i: _grupo(i)),
    ("Item", lambda p, i: i.descricao),
    ("Unidade", lambda p, i: i.unidade),
    ("Quantidade", lambda p, i: i.quantidade),
    ("Valor unitário (R$)", lambda p, i: round(i.valor_unitario, 2)),
    ("Valor total (R$)", lambda p, i: round(i.valor_total, 2)),
]

COLS_INSUMO = [
    ("Insumo", lambda i: i.nome),
    ("Grupo", lambda i: i.categoria.nome if i.categoria else ""),
    ("Unidade", lambda i: i.unidade),
    ("Custo unitário (R$)", lambda i: round(i.custo_unitario, 2)),
    ("Fornecedor", lambda i: i.fornecedor or ""),
    ("Observações", lambda i: i.observacoes or ""),
    ("Ativo", lambda i: "Sim" if i.ativo else "Não"),
]


def _produtos(db: Session):
    return db.scalars(
        select(models.Produto).options(selectinload(models.Produto.itens_custo).selectinload(models.ItemCusto.insumo)).order_by(models.Produto.nome)
    ).all()


def _linhas_produtos(db):
    yield [c[0] for c in COLS_PRODUTO]
    for p in _produtos(db):
        campos = p.campos_extras or {}
        yield [f(p) for _, f in COLS_PRODUTO] + [f"{k}: {v}" for k, v in campos.items()]


def _linhas_custos(db):
    yield [c[0] for c in COLS_CUSTO]
    for p in _produtos(db):
        for i in p.itens_custo:
            yield [f(p, i) for _, f in COLS_CUSTO]
        if p.itens_custo:
            yield [p.codigo or "", p.nome, "", "CUSTO TOTAL DA PEÇA", "", "", "", round(p.custo_producao, 2)]


def _linhas_insumos(db):
    yield [c[0] for c in COLS_INSUMO]
    for i in db.scalars(select(models.Insumo).order_by(models.Insumo.nome)).all():
        yield [f(i) for _, f in COLS_INSUMO]


PLANILHAS = {"produtos": _linhas_produtos, "custos": _linhas_custos, "insumos": _linhas_insumos}


def _nome(base: str, ext: str) -> str:
    return f"gilda_{base}_{datetime.now():%Y-%m-%d}.{ext}"


@router.get("/{tipo}.csv")
def csv_export(tipo: str, db: Session = Depends(get_db)):
    if tipo not in PLANILHAS:
        return {"detail": "Tipo inválido"}
    buf = io.StringIO()
    buf.write("﻿")  # BOM para o Excel abrir acentos corretamente
    w = csv.writer(buf, delimiter=";", lineterminator="\n")
    for linha in PLANILHAS[tipo](db):
        w.writerow([str(v).replace(".", ",") if isinstance(v, float) else v for v in linha])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{_nome(tipo, "csv")}"'},
    )


@router.get("/completo.xlsx")
def xlsx_export(db: Session = Depends(get_db)):
    wb = Workbook()
    wb.remove(wb.active)
    cabecalho_fill = PatternFill("solid", fgColor="75230B")
    cabecalho_font = Font(bold=True, color="E9E9D4")
    for titulo, gerador in (("Peças", _linhas_produtos), ("Composição de custos", _linhas_custos), ("Insumos", _linhas_insumos)):
        ws = wb.create_sheet(titulo)
        for idx, linha in enumerate(gerador(db), start=1):
            ws.append(linha)
            if idx == 1:
                for cell in ws[1]:
                    cell.fill = cabecalho_fill
                    cell.font = cabecalho_font
                    cell.alignment = Alignment(vertical="center")
        for col in range(1, ws.max_column + 1):
            largura = max((len(str(c.value)) for c in ws[get_column_letter(col)] if c.value is not None), default=10)
            ws.column_dimensions[get_column_letter(col)].width = min(max(12, largura + 2), 50)
        ws.freeze_panes = "A2"
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(
        out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{_nome("completo", "xlsx")}"'},
    )
