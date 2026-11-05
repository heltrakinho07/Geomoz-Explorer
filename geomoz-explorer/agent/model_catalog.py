"""Discover provider-visible GEOAGENTE text/tool models without logging API keys."""
import json
import re
import urllib.error
import urllib.request

# Visibility from provider != guaranteed function-calling capability.
OPENAI = re.compile(r"^(?:gpt-4o(?:-mini)?|gpt-4\.1(?:-mini|-nano)?|gpt-5[\w.-]*|o3[\w.-]*|o4[\w.-]*)$")
GEMINI = re.compile(r"^gemini-(?:2\.5|3[\w.]*)-(?:flash|pro)[\w.-]*$")


def discover_models(provider: str, key: str) -> dict:
    if provider not in {"openai", "gemini"}:
        raise ValueError("Provedor inválido.")
    if not key or len(key) > 2048:
        raise ValueError("Introduza uma chave API válida para consultar os modelos.")
    if provider == "openai":
        url = "https://api.openai.com/v1/models"
        headers = {"Authorization": f"Bearer {key}", "Accept": "application/json"}
    else:
        url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"
        headers = {"x-goog-api-key": key, "Accept": "application/json"}

    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            payload = json.loads(response.read(2_000_000))
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            raise ValueError("Chave API sem acesso aos modelos deste provedor.") from None
        if exc.code == 429:
            raise ValueError("Limite de consultas à API atingido. Tente mais tarde.") from None
        raise ValueError(f"Falha na consulta aos modelos (HTTP {exc.code}).") from None
    except (urllib.error.URLError, TimeoutError):
        raise ValueError("Não foi possível ligar à API para consultar os modelos.") from None

    if provider == "openai":
        entries = payload.get("data", [])
        names = [m.get("id", "") for m in entries if isinstance(m, dict)]
        pattern = OPENAI
    else:
        entries = payload.get("models", [])
        names = [
            m.get("name", "").removeprefix("models/")
            for m in entries if isinstance(m, dict)
            and "generateContent" in m.get("supportedGenerationMethods", [])
        ]
        pattern = GEMINI
    models = sorted({name for name in names if pattern.fullmatch(name)})
    return {
        "provider": provider,
        "models": [{"id": mid, "label": mid} for mid in models],
        "source": "provider",
        "notice": "Disponibilidade verificada na conta. Compatibilidade com ferramentas validada ao executar o pedido.",
    }
