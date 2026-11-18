"""Authenticated jobs API; computation is isolated in a private GemPy worker."""
import hashlib
import json
import os
import re
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from billing import _uid, _db
from geological_model import parse_model, InvalidModel, MAX_INPUT_BYTES, MAX_RESULT_BYTES
from geological_store import GeologicalStore, StoreError, TERMINAL, now_iso
from geological_examples import example_model
from subscription_entitlements import require_plan_feature

router = APIRouter(prefix="/geomoz-api/geology",tags=["geological-modelling"])
ID = re.compile(r"^[a-f0-9]{32}$")
PROJECT_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
KEY = re.compile(r"^[A-Za-z0-9_-]{16,80}$")
LIMITS = {"academic":10,"pro":40,"teams":100,"enterprise":200}


def settings():
    names = ["BUCKET","QUEUE","WORKER_URL","TASK_ACCOUNT"]
    cfg = {k:os.getenv("GEOMOZ_GEOLOGY_"+k,"").strip() for k in names}
    if os.getenv("GEOMOZ_GEOLOGY_ENABLED","false").lower() != "true" or not all(cfg.values()):
        raise HTTPException(503,"O cálculo geológico ainda não está activado. Pode preparar e exportar os dados.")
    url=urlsplit(cfg["WORKER_URL"])
    if (url.scheme!="https" or not url.hostname or not url.hostname.endswith(".run.app")
        or url.path not in ("","/") or url.query or url.fragment or url.username or url.password
        or not re.fullmatch(r"projects/[^/]+/locations/[^/]+/queues/[^/]+",cfg["QUEUE"])):
        raise HTTPException(503,"Serviço geológico configurado incorrectamente.")
    cfg["WORKER_URL"]=cfg["WORKER_URL"].rstrip("/")
    return cfg


def bucket():
    from google.cloud import storage
    name=os.getenv("GEOMOZ_GEOLOGY_BUCKET","")
    if not name:
        raise HTTPException(503,"Armazenamento geológico não configurado.")
    return storage.Client().bucket(name)


def store():
    return GeologicalStore(_db())


def public(job_id, doc):
    return {"id":job_id,**{k:doc.get(k) for k in ("projectId","name","status","createdAt","updatedAt","error")}}


def owned(uid,job_id):
    if not ID.fullmatch(job_id):
        raise HTTPException(404,"Modelo não encontrado.")
    try:
        doc=store().owned(uid,job_id)
        if doc["status"] not in TERMINAL and doc["deadline"]<now_iso():
            store().finish(job_id,"failed",error="A execução excedeu o prazo. Volte a calcular.")
            doc=store().owned(uid,job_id)
        return doc
    except StoreError as exc:
        raise HTTPException(exc.status,str(exc)) from exc


def enqueue(cfg,job_id):
    from google.cloud import tasks_v2
    from google.protobuf.duration_pb2 import Duration
    queue=cfg["QUEUE"]
    tasks_v2.CloudTasksClient().create_task(request={"parent":queue,"task":{
        "name":f"{queue}/tasks/geology-{job_id}","dispatch_deadline":Duration(seconds=600),
        "http_request":{"http_method":tasks_v2.HttpMethod.POST,"url":cfg["WORKER_URL"]+"/tasks/compute",
            "headers":{"Content-Type":"application/json"},"body":json.dumps({"jobId":job_id}).encode(),
            "oidc_token":{"service_account_email":cfg["TASK_ACCOUNT"],"audience":cfg["WORKER_URL"]}}}})


@router.get("/capabilities")
def capabilities(uid: str=Depends(_uid)):
    try:
        settings(); enabled=True
    except HTTPException:
        enabled=False
    try:
        plan=require_plan_feature(uid,"cloud_jobs"); entitled=True
    except HTTPException as exc:
        if exc.status_code!=403: raise
        plan,entitled="community",False
    return dict(configured=enabled,canCompute=enabled and entitled,entitled=entitled,
                monthlyLimit=LIMITS.get(plan,0),maxStored=100,maxContacts=250,maxOrientations=100,resolutions=[16,24,32])


@router.get("/examples/{name}")
def example(name: str,uid: str=Depends(_uid)):
    if name not in ("strata","fault"): raise HTTPException(404,"Exemplo desconhecido.")
    return example_model(name=="fault")


@router.post("/jobs",status_code=202)
async def create(request: Request,project_id: str,uid: str=Depends(_uid),
                 idempotency_key: str=Header(default="",alias="Idempotency-Key")):
    cfg=settings()
    plan=await run_in_threadpool(require_plan_feature,uid,"cloud_jobs")
    if not KEY.fullmatch(idempotency_key) or not PROJECT_ID.fullmatch(project_id):
        raise HTTPException(422,"Projecto ou chave de execução inválidos.")
    chunks,size=[],0
    async for chunk in request.stream():
        size+=len(chunk)
        if size>MAX_INPUT_BYTES: raise HTTPException(413,"Modelo excede 1 MB.")
        chunks.append(chunk)
    try: spec=parse_model(b"".join(chunks))
    except InvalidModel as exc: raise HTTPException(422,str(exc)) from exc
    raw=json.dumps(spec,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()
    digest=hashlib.sha256(project_id.encode()+b"\0"+raw).hexdigest()
    try:
        job_id,created=await run_in_threadpool(store().allocate,uid,project_id,idempotency_key,digest,spec,LIMITS[plan])
    except StoreError as exc: raise HTTPException(exc.status,str(exc)) from exc
    if created:
        doc=await run_in_threadpool(owned,uid,job_id)
        try:
            await run_in_threadpool(lambda:bucket().blob(doc["inputPath"]).upload_from_string(raw,content_type="application/json",if_generation_match=0))
            await run_in_threadpool(enqueue,cfg,job_id)
        except Exception as exc:
            await run_in_threadpool(store().finish,job_id,"failed",error="Não foi possível enviar o cálculo. Tente uma nova execução.")
            raise HTTPException(503,"Não foi possível colocar o modelo na fila.") from exc
    return public(job_id,await run_in_threadpool(owned,uid,job_id))


@router.get("/jobs")
def list_jobs(project_id: str,uid: str=Depends(_uid)):
    if not PROJECT_ID.fullmatch(project_id): raise HTTPException(422,"Projecto inválido.")
    return [public(ident,owned(uid,ident)) for ident,_ in store().list(uid,project_id)]


@router.get("/jobs/{job_id}")
def status(job_id: str,uid: str=Depends(_uid)):
    return public(job_id,owned(uid,job_id))


@router.get("/jobs/{job_id}/{kind}")
def artifact(job_id: str,kind: str,uid: str=Depends(_uid)):
    if kind not in ("input","result"): raise HTTPException(404)
    doc=owned(uid,job_id)
    if kind=="result" and doc["status"]!="succeeded": raise HTTPException(409,"Resultado ainda não disponível.")
    blob=bucket().blob(doc[kind+"Path"])
    try:
        blob.reload()
        if not blob.size or blob.size>(MAX_RESULT_BYTES if kind=="result" else MAX_INPUT_BYTES): raise ValueError("Invalid size")
        data=blob.download_as_bytes(if_generation_match=blob.generation)
    except Exception as exc: raise HTTPException(503,"Não foi possível obter o ficheiro do modelo.") from exc
    return Response(data,media_type="application/json",headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"})


@router.post("/jobs/{job_id}/cancel")
def cancel(job_id: str,uid: str=Depends(_uid)):
    owned(uid,job_id); store().finish(job_id,"cancelled")
    return public(job_id,owned(uid,job_id))


@router.delete("/jobs/{job_id}")
def delete(job_id: str,uid: str=Depends(_uid)):
    doc=owned(uid,job_id)
    if doc["status"] not in TERMINAL: raise HTTPException(409,"Cancele a execução antes de eliminar.")
    # Remove artifacts first; failures leave metadata for a retriable delete.
    prefix=doc["inputPath"].rsplit("/",1)[0]+"/"
    for blob in bucket().list_blobs(prefix=prefix): blob.delete()
    try: store().remove(uid,job_id)
    except StoreError as exc: raise HTTPException(exc.status,str(exc)) from exc
    return {"deleted":True}
