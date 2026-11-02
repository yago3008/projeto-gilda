"""Esquemas Pydantic (entrada e saída da API)."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Cadastros auxiliares ----------
class ColecaoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    descricao: str | None = None
    ano: int | None = None
    ativa: bool = True


class ColecaoOut(ORM, ColecaoIn):
    id: int
    total_produtos: int = 0


class CategoriaIn(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    descricao: str | None = None


class CategoriaOut(ORM, CategoriaIn):
    id: int
    total_produtos: int = 0


class OpcaoIn(BaseModel):
    tipo: str = Field(pattern="^(tamanho|cor|unidade|motivo)$")
    valor: str = Field(min_length=1, max_length=80)
    ordem: int = 0


class OpcaoOut(ORM, OpcaoIn):
    id: int


class CampoIn(BaseModel):
    chave: str = Field(min_length=1, max_length=60, pattern=r"^[a-z0-9_]+$")
    rotulo: str = Field(min_length=1, max_length=120)
    tipo: str = Field(default="texto", pattern="^(texto|numero|lista|booleano|data)$")
    opcoes: list[str] | None = None
    obrigatorio: bool = False
    ordem: int = 0
    ativo: bool = True


class CampoOut(ORM, CampoIn):
    id: int


class CategoriaInsumoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    ordem: int = 0


class CategoriaInsumoOut(ORM, CategoriaInsumoIn):
    id: int
    total_insumos: int = 0


# ---------- Insumos ----------
class InsumoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=160)
    categoria_id: int | None = None
    unidade: str = "un"
    custo_unitario: float = Field(ge=0, default=0.0)
    fornecedor: str | None = None
    observacoes: str | None = None
    ativo: bool = True


class InsumoOut(ORM, InsumoIn):
    id: int
    categoria_nome: str | None = None
    usado_em: int = 0


# ---------- Produtos e composição ----------
class ItemCustoIn(BaseModel):
    insumo_id: int | None = None
    categoria_insumo_id: int | None = None
    descricao: str = Field(min_length=1, max_length=160)
    unidade: str = "un"
    quantidade: float = Field(ge=0, default=1.0)
    valor_unitario: float = Field(ge=0, default=0.0)
    ordem: int = 0


class ItemCustoOut(ORM, ItemCustoIn):
    id: int
    valor_total: float
    categoria_insumo_nome: str | None = None


class ProdutoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=160)
    codigo: str | None = None
    colecao_id: int | None = None
    categoria_id: int | None = None
    tamanho: str | None = None
    cor: str | None = None
    quantidade_estoque: int = Field(ge=0, default=0)
    estoque_minimo: int = Field(ge=0, default=0)
    preco_venda: float = Field(ge=0, default=0.0)
    descricao: str | None = None
    campos_extras: dict[str, Any] = Field(default_factory=dict)
    ativo: bool = True
    itens_custo: list[ItemCustoIn] | None = None  # se enviado, substitui a composição inteira


class ProdutoResumo(ORM):
    id: int
    nome: str
    codigo: str | None
    colecao_id: int | None
    categoria_id: int | None
    colecao_nome: str | None = None
    categoria_nome: str | None = None
    tamanho: str | None
    cor: str | None
    quantidade_estoque: int
    estoque_minimo: int
    preco_venda: float
    custo_producao: float
    margem_valor: float = 0.0
    margem_percentual: float | None = None
    ativo: bool
    atualizado_em: datetime | None = None


class ProdutoOut(ProdutoResumo):
    descricao: str | None
    campos_extras: dict[str, Any] | None
    criado_em: datetime | None = None
    itens_custo: list[ItemCustoOut] = []


# ---------- Estoque ----------
class MovimentacaoIn(BaseModel):
    tipo: str = Field(pattern="^(entrada|saida|ajuste)$")
    quantidade: int = Field(ge=0)
    motivo: str | None = None
    observacao: str | None = None
    data: datetime | None = None


class MovimentacaoOut(ORM, MovimentacaoIn):
    id: int
    produto_id: int
    produto_nome: str | None = None
    estoque_resultante: int | None = None
    data: datetime


# ---------- Autenticação ----------
class LoginIn(BaseModel):
    usuario: str
    senha: str
