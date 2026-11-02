"""Modelos do sistema Gilda.

Tudo foi pensado para ser modular: coleções, categorias, categorias de insumo,
opções (tamanhos, cores, unidades) e campos personalizados são tabelas próprias,
então novos valores são cadastrados pela interface sem mexer no código.
"""
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Colecao(Base):
    """Coleção ou capítulo (a marca chama suas coleções de capítulos)."""

    __tablename__ = "colecoes"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(120), unique=True)
    descricao: Mapped[str | None] = mapped_column(Text)
    ano: Mapped[int | None] = mapped_column(Integer)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True)

    produtos: Mapped[list["Produto"]] = relationship(back_populates="colecao")


class Categoria(Base):
    """Categoria da peça: camisa, calça, bermuda, lenço..."""

    __tablename__ = "categorias"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(80), unique=True)
    descricao: Mapped[str | None] = mapped_column(Text)

    produtos: Mapped[list["Produto"]] = relationship(back_populates="categoria")


class Opcao(Base):
    """Listas de opções reutilizáveis (tamanho, cor, unidade de medida)."""

    __tablename__ = "opcoes"
    __table_args__ = (UniqueConstraint("tipo", "valor", name="uq_opcao_tipo_valor"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(40))  # tamanho | cor | unidade
    valor: Mapped[str] = mapped_column(String(80))
    ordem: Mapped[int] = mapped_column(Integer, default=0)


class CampoPersonalizado(Base):
    """Campos extras que as donas podem criar para o cadastro de peças."""

    __tablename__ = "campos_personalizados"

    id: Mapped[int] = mapped_column(primary_key=True)
    chave: Mapped[str] = mapped_column(String(60), unique=True)
    rotulo: Mapped[str] = mapped_column(String(120))
    tipo: Mapped[str] = mapped_column(String(20), default="texto")  # texto | numero | lista | booleano | data
    opcoes: Mapped[list | None] = mapped_column(JSON)  # para tipo lista
    obrigatorio: Mapped[bool] = mapped_column(Boolean, default=False)
    ordem: Mapped[int] = mapped_column(Integer, default=0)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)


class CategoriaInsumo(Base):
    """Grupo de custo: tecido, botões, zíperes, etiquetas, aviamentos, mão de obra, embalagem, sacola..."""

    __tablename__ = "categorias_insumo"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(80), unique=True)
    ordem: Mapped[int] = mapped_column(Integer, default=0)

    insumos: Mapped[list["Insumo"]] = relationship(back_populates="categoria")


class Insumo(Base):
    """Item de custo cadastrado com valor unitário padrão (ex.: linho bege, botão de madrepérola)."""

    __tablename__ = "insumos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(160))
    categoria_id: Mapped[int | None] = mapped_column(ForeignKey("categorias_insumo.id", ondelete="SET NULL"))
    unidade: Mapped[str] = mapped_column(String(20), default="un")  # m, un, h, kg, par...
    custo_unitario: Mapped[float] = mapped_column(Float, default=0.0)
    fornecedor: Mapped[str | None] = mapped_column(String(160))
    observacoes: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)

    categoria: Mapped["CategoriaInsumo | None"] = relationship(back_populates="insumos")
    itens: Mapped[list["ItemCusto"]] = relationship(back_populates="insumo")


class Produto(Base):
    """A peça em si."""

    __tablename__ = "produtos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(160))
    codigo: Mapped[str | None] = mapped_column(String(60), unique=True)
    colecao_id: Mapped[int | None] = mapped_column(ForeignKey("colecoes.id", ondelete="SET NULL"))
    categoria_id: Mapped[int | None] = mapped_column(ForeignKey("categorias.id", ondelete="SET NULL"))
    tamanho: Mapped[str | None] = mapped_column(String(40))
    cor: Mapped[str | None] = mapped_column(String(80))
    quantidade_estoque: Mapped[int] = mapped_column(Integer, default=0)
    estoque_minimo: Mapped[int] = mapped_column(Integer, default=0)
    preco_venda: Mapped[float] = mapped_column(Float, default=0.0)
    # Custo de produção calculado a partir da composição; mantido em cache para listagens e dashboards.
    custo_producao: Mapped[float] = mapped_column(Float, default=0.0)
    descricao: Mapped[str | None] = mapped_column(Text)
    campos_extras: Mapped[dict | None] = mapped_column(JSON, default=dict)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    colecao: Mapped["Colecao | None"] = relationship(back_populates="produtos")
    categoria: Mapped["Categoria | None"] = relationship(back_populates="produtos")
    itens_custo: Mapped[list["ItemCusto"]] = relationship(
        back_populates="produto", cascade="all, delete-orphan", order_by="ItemCusto.ordem"
    )
    movimentacoes: Mapped[list["MovimentacaoEstoque"]] = relationship(
        back_populates="produto", cascade="all, delete-orphan", order_by="MovimentacaoEstoque.data.desc()"
    )

    def recalcular_custo(self) -> float:
        self.custo_producao = round(sum(i.valor_total for i in self.itens_custo), 2)
        return self.custo_producao


class ItemCusto(Base):
    """Uma linha da composição de custo de uma peça."""

    __tablename__ = "itens_custo"

    id: Mapped[int] = mapped_column(primary_key=True)
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id", ondelete="CASCADE"))
    insumo_id: Mapped[int | None] = mapped_column(ForeignKey("insumos.id", ondelete="SET NULL"))
    categoria_insumo_id: Mapped[int | None] = mapped_column(ForeignKey("categorias_insumo.id", ondelete="SET NULL"))
    descricao: Mapped[str] = mapped_column(String(160))
    unidade: Mapped[str] = mapped_column(String(20), default="un")
    quantidade: Mapped[float] = mapped_column(Float, default=1.0)
    valor_unitario: Mapped[float] = mapped_column(Float, default=0.0)
    valor_total: Mapped[float] = mapped_column(Float, default=0.0)
    ordem: Mapped[int] = mapped_column(Integer, default=0)

    produto: Mapped["Produto"] = relationship(back_populates="itens_custo")
    insumo: Mapped["Insumo | None"] = relationship(back_populates="itens")
    categoria_insumo: Mapped["CategoriaInsumo | None"] = relationship()

    def calcular(self) -> float:
        self.valor_total = round((self.quantidade or 0) * (self.valor_unitario or 0), 2)
        return self.valor_total


class MovimentacaoEstoque(Base):
    """Entradas, saídas e ajustes de estoque com histórico."""

    __tablename__ = "movimentacoes_estoque"

    id: Mapped[int] = mapped_column(primary_key=True)
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id", ondelete="CASCADE"))
    tipo: Mapped[str] = mapped_column(String(20))  # entrada | saida | ajuste
    quantidade: Mapped[int] = mapped_column(Integer)
    motivo: Mapped[str | None] = mapped_column(String(80))  # producao, venda, perda, devolucao, inventario...
    observacao: Mapped[str | None] = mapped_column(Text)
    data: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    estoque_resultante: Mapped[int | None] = mapped_column(Integer)

    produto: Mapped["Produto"] = relationship(back_populates="movimentacoes")
