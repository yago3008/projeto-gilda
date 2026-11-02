"""Login simples: um usuário e senha definidos por variáveis de ambiente, sessão em cookie assinado."""
import os
import secrets

from fastapi import Depends, HTTPException, Request, status

USUARIO = os.environ.get("GILDA_USER", "gilda")
SENHA = os.environ.get("GILDA_PASSWORD", "gilda123")
SECRET_KEY = os.environ.get("GILDA_SECRET_KEY") or secrets.token_hex(32)


def credenciais_validas(usuario: str, senha: str) -> bool:
    return secrets.compare_digest(usuario, USUARIO) and secrets.compare_digest(senha, SENHA)


def usuario_logado(request: Request) -> str:
    usuario = request.session.get("usuario")
    if not usuario:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Faça login para continuar.")
    return usuario


ProtegidoPorLogin = Depends(usuario_logado)
