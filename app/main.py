"""Ponto de entrada da aplicação Gilda (FastAPI)."""
import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from . import auth, models, schemas, seed  # noqa: F401  (models precisa ser importado antes do create_all)
from .database import Base, SessionLocal, engine
from .routers import cadastros, dashboard, estoque, exportar, insumos, produtos

STATIC = Path(__file__).parent / "static"

app = FastAPI(title="GILDA; Gestão de peças e custos", version="1.0.0", docs_url="/docs", redoc_url=None)
app.add_middleware(SessionMiddleware, secret_key=auth.SECRET_KEY, session_cookie="gilda_sessao", max_age=60 * 60 * 24 * 7, same_site="lax")


@app.on_event("startup")
def _iniciar():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed.popular_base(db)
        if os.environ.get("GILDA_SEED_EXEMPLO", "1") == "1":
            seed.popular_exemplo(db)


# ---------- Autenticação ----------
@app.post("/api/login", tags=["auth"])
def login(dados: schemas.LoginIn, request: Request):
    if not auth.credenciais_validas(dados.usuario, dados.senha):
        raise HTTPException(401, "Usuário ou senha inválidos.")
    request.session["usuario"] = dados.usuario
    return {"usuario": dados.usuario}


@app.post("/api/logout", tags=["auth"])
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/me", tags=["auth"])
def me(usuario: str = Depends(auth.usuario_logado)):
    return {"usuario": usuario}


@app.get("/api/health", tags=["auth"])
def health():
    return {"status": "ok"}


for r in (cadastros.router, insumos.router, produtos.router, estoque.router, dashboard.router, exportar.router):
    app.include_router(r)


@app.exception_handler(HTTPException)
async def _http_exc(request: Request, exc: HTTPException):
    if exc.status_code == 401 and not request.url.path.startswith("/api"):
        return RedirectResponse("/login")
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


# ---------- Frontend ----------
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/login", include_in_schema=False)
def pagina_login(request: Request):
    if request.session.get("usuario"):
        return RedirectResponse("/")
    return FileResponse(STATIC / "login.html")


@app.get("/", include_in_schema=False)
def pagina_inicial(request: Request):
    if not request.session.get("usuario"):
        return RedirectResponse("/login")
    return FileResponse(STATIC / "index.html")


@app.get("/{caminho:path}", include_in_schema=False)
def spa(caminho: str, request: Request):
    if caminho.startswith(("api/", "static/", "docs")):
        raise HTTPException(404, "Não encontrado.")
    if not request.session.get("usuario"):
        return RedirectResponse("/login")
    return FileResponse(STATIC / "index.html")
