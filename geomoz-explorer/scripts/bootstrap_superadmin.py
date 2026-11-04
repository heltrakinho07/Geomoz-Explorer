#!/usr/bin/env python3
"""Provision the FIRST GeoMoz superuser out-of-band, never through an HTTP API.

Usage (from a trusted machine with GOOGLE_APPLICATION_CREDENTIALS or ADC):
    python geomoz-explorer/scripts/bootstrap_superadmin.py --email conta@dominio.com
    python geomoz-explorer/scripts/bootstrap_superadmin.py --email conta@dominio.com --apply

The first command is read-only. The second changes Firebase custom claims
and revokes previous refresh tokens. Only Firebase project administrators can
run it; no root passwords or personal emails are embedded in the application.
"""
import argparse
import os
import sys


def main():
    parser = argparse.ArgumentParser(description="GeoMoz — primeiro superutilizador Firebase")
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument("--email", help="E-mail Firebase Auth existente")
    choice.add_argument("--uid", help="UID Firebase Auth existente")
    parser.add_argument("--project", default="geoprocessamento-426809")
    parser.add_argument("--apply", action="store_true",
                        help="Efectuar alteração; sem esta opção é apenas uma simulação")
    args = parser.parse_args()

    import firebase_admin
    from firebase_admin import auth

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": args.project})
    target = auth.get_user_by_email(args.email) if args.email else auth.get_user(args.uid)
    if target.disabled:
        parser.error("A conta está desactivada; não pode ser elevada a superutilizador.")
    original = target.custom_claims or {}
    new_claims = {**original, "geomoz_role": "superadmin"}
    print("Projecto:", args.project)
    print("UID:", target.uid)
    print("E-mail:", target.email)
    print("Perfil actual:", original.get("geomoz_role", "user"))
    print("Perfil pretendido: superadmin")
    print("Alteração:", "APLICAR" if args.apply else "SIMULAÇÃO (nenhum dado alterado)")

    if not args.apply:
        print("Execute novamente com --apply após confirmar UID, e-mail e projecto.")
        return 0

    auth.set_custom_user_claims(target.uid, new_claims)
    auth.revoke_refresh_tokens(target.uid)
    print("Permissões atribuídas. O utilizador deve terminar e reiniciar sessão.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
