"""Independent Firebase ID-token verification for billing and project quotas.

Never accept user IDs from headers, request bodies or unverified JWT payloads.
"""
from fastapi import HTTPException, Request


async def require_billing_auth(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "Inicie sessão para gerir a subscrição.")
    token = header[7:].strip()
    if not token:
        raise HTTPException(401, "Token de autenticação em falta.")
    try:
        from firebase_admin import auth as firebase_auth
        decoded = firebase_auth.verify_id_token(token)
        uid = decoded.get("uid")
        if not uid:
            raise ValueError("UID ausente.")
        return str(uid)
    except Exception as exc:
        raise HTTPException(401, "Token Firebase inválido ou expirado.") from exc
