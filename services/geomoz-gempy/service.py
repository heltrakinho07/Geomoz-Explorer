"""Private Cloud Tasks target; Cloud Run IAM plus verified OIDC task identity."""
import asyncio
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from fastapi import FastAPI,HTTPException,Request
from fastapi.concurrency import run_in_threadpool
from google.cloud import firestore,storage
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from geological_model import MAX_INPUT_BYTES,MAX_RESULT_BYTES,parse_model
from geological_store import GeologicalStore,TERMINAL

app=FastAPI(docs_url=None,redoc_url=None)
log=logging.getLogger("geomoz.gempy")
lock=asyncio.Lock()


def verify(request):
    audience=os.getenv("GEOMOZ_GEOLOGY_WORKER_URL","")
    account=os.getenv("GEOMOZ_GEOLOGY_TASK_ACCOUNT","")
    auth=request.headers.get("Authorization","")
    if not audience or not account or not auth.startswith("Bearer "): raise HTTPException(401,"Private worker")
    try: claims=id_token.verify_oauth2_token(auth[7:],GoogleRequest(),audience=audience)
    except Exception as exc: raise HTTPException(401,"Invalid task identity") from exc
    if claims.get("email")!=account or claims.get("email_verified") is not True or claims.get("iss") not in ("accounts.google.com","https://accounts.google.com"):
        raise HTTPException(403,"Forbidden task identity")


def run_job(job_id):
    db=GeologicalStore(firestore.Client())
    doc=db.claim(job_id)
    if doc=="busy": raise HTTPException(503,"Job already running")
    if doc=="expired":
        db.finish(job_id,"failed",error="A execução excedeu o prazo.");return {"status":"failed"}
    if doc is None: return {"status":"noop"}
    token=doc["leaseToken"]
    process=None
    try:
        bucket=storage.Client().bucket(os.environ["GEOMOZ_GEOLOGY_BUCKET"])
        source=bucket.blob(doc["inputPath"]);source.reload()
        if not source.size or source.size>MAX_INPUT_BYTES: raise ValueError("Invalid input size")
        raw=source.download_as_bytes(if_generation_match=source.generation);parse_model(raw)
        with tempfile.TemporaryDirectory(prefix="gempy-") as directory:
            input_path,output_path=Path(directory)/"input.json",Path(directory)/"result.json"
            input_path.write_bytes(raw)
            process=subprocess.Popen([sys.executable,str(Path(__file__).with_name("engine.py")),str(input_path),str(output_path)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            deadline=time.monotonic()+440
            while process.poll() is None:
                state=db.job_ref(job_id).get().to_dict()
                if not state or state["status"] in TERMINAL or state.get("leaseToken")!=token: return {"status":"cancelled"}
                if time.monotonic()>=deadline: raise TimeoutError("Compute timeout")
                time.sleep(2)
            if process.returncode or not output_path.exists() or output_path.stat().st_size>MAX_RESULT_BYTES: raise ValueError("GemPy computation failed")
            path=doc["inputPath"].rsplit("/",1)[0]+"/result-"+token+".json"
            output_blob=bucket.blob(path)
            output_blob.upload_from_string(output_path.read_bytes(),content_type="application/json",if_generation_match=0)
            if not db.finish(job_id,"succeeded",token,result_path=path):
                output_blob.delete();return {"status":"cancelled"}
            return {"status":"succeeded"}
    except Exception:
        log.exception("Geological calculation failed for job %s",job_id)
        db.finish(job_id,"failed",token,error="Não foi possível calcular o modelo. Verifique os contactos, orientações e sequência; reduza a resolução se necessário.")
        return {"status":"failed"}
    finally:
        if process and process.poll() is None:
            process.terminate()
            try: process.wait(timeout=3)
            except subprocess.TimeoutExpired: process.kill();process.wait()


@app.get("/health")
def health():
    from importlib.metadata import version
    return {"status":"ok","gempy":version("gempy"),"gempy_engine":version("gempy_engine")}


@app.post("/tasks/compute")
async def compute_task(request: Request):
    await run_in_threadpool(verify,request)
    raw=b""
    async for chunk in request.stream():
        raw+=chunk
        if len(raw)>1024: raise HTTPException(413)
    try:
        payload=json.loads(raw);job_id=payload["jobId"]
        if set(payload)!={"jobId"} or not isinstance(job_id,str) or not re.fullmatch(r"[a-f0-9]{32}",job_id): raise ValueError()
    except (ValueError,TypeError,KeyError): raise HTTPException(400,"Invalid task")
    if lock.locked(): raise HTTPException(503,"Worker occupied")
    async with lock: return await run_in_threadpool(run_job,job_id)
