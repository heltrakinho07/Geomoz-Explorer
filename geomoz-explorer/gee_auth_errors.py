"""Shared handling of expired Earth Engine sessions."""

RECONNECT_GEE_MESSAGE = (
    "A sua sessão do Google Earth Engine expirou ou deixou de estar autorizada. "
    "Volte a ligar a conta Google no cabeçalho ou nas Definições e repita a análise."
)


class GeeSessionExpired(RuntimeError):
    pass


def is_gee_session_expired(exc):
    if isinstance(exc, GeeSessionExpired) or type(exc).__name__ == "RefreshError":
        return True
    return any(marker in str(exc).casefold() for marker in (
        "necessary fields need to refresh the access token",
        "invalid_grant",
        "token has been expired or revoked",
        "access token expired",
        "invalid authentication credentials",
    ))
