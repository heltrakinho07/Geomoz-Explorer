"""Server-owned Firestore state machine, with transactional quotas and lease fencing."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
try:
    from google.cloud import firestore
except ImportError:  # Legacy CI imports the gateway without cloud dependencies.
    firestore = None
TERMINAL = {"succeeded", "failed", "cancelled"}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class StoreError(ValueError):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


class GeologicalStore:
    def __init__(self, db):
        self.db = db

    def job_ref(self, job_id):
        return self.db.collection("geologicalJobs").document(job_id)

    def quota_ref(self, uid):
        return self.db.collection("geologicalQuotas").document(hashlib.sha256(uid.encode()).hexdigest())

    def owned(self, uid, job_id):
        doc = self.job_ref(job_id).get().to_dict()
        if not doc or doc.get("uid") != uid:
            raise StoreError(404, "Modelo não encontrado.")
        return doc

    def allocate(self, uid, project_id, key, digest, spec, monthly_limit):
        now = datetime.now(timezone.utc)
        job_id = secrets.token_hex(16)
        quota_ref = self.quota_ref(uid)
        key_ref = quota_ref.collection("keys").document(key)
        project_ref = self.db.collection("users").document(uid).collection("projects").document(project_id)
        @firestore.transactional
        def reserve(tx):
            project = project_ref.get(transaction=tx)
            old_key = key_ref.get(transaction=tx)
            quota = quota_ref.get(transaction=tx).to_dict() or {}
            if not project.exists:
                raise StoreError(409, "Guarde o projecto na nuvem antes de calcular o modelo.")
            if old_key.exists:
                previous = old_key.to_dict()
                if previous["digest"] != digest:
                    raise StoreError(409, "Chave de execução reutilizada com dados diferentes.")
                return previous["jobId"], False
            month = now.strftime("%Y-%m")
            count = quota.get("monthlyCount", 0) if quota.get("month") == month else 0
            active = {k:v for k,v in quota.get("active", {}).items() if v > now.isoformat()}
            if active:
                raise StoreError(429, "Já existe um modelo em cálculo. Aguarde ou cancele-o.")
            if count >= monthly_limit:
                raise StoreError(429, "Limite mensal de modelos atingido.")
            if quota.get("stored", 0) >= 100:
                raise StoreError(429, "Limite de 100 modelos guardados. Elimine modelos antigos.")
            expires = (now + timedelta(minutes=15)).isoformat()
            prefix = f"geological-models/{hashlib.sha256(uid.encode()).hexdigest()}/{job_id}"
            tx.create(self.job_ref(job_id), dict(uid=uid,projectId=project_id,name=spec["name"],
                status="queued",createdAt=now.isoformat(),updatedAt=now.isoformat(),deadline=expires,
                inputPath=prefix+"/input.json",resultPath=prefix+"/result.json",attempt=0,error="",digest=digest))
            tx.create(key_ref,dict(jobId=job_id,digest=digest,expireAt=now+timedelta(days=32)))
            active[job_id]=expires
            tx.set(quota_ref,dict(month=month,monthlyCount=count+1,stored=quota.get("stored",0)+1,active=active))
            return job_id, True
        return reserve(self.db.transaction())

    def claim(self, job_id):
        ref = self.job_ref(job_id)
        now = datetime.now(timezone.utc)
        @firestore.transactional
        def lease(tx):
            doc = ref.get(transaction=tx).to_dict()
            if not doc or doc["status"] in TERMINAL:
                return None
            if doc["deadline"] < now.isoformat():
                return "expired"
            if doc.get("leaseUntil", "") > now.isoformat():
                return "busy"
            token = secrets.token_hex(16)
            tx.update(ref,dict(status="running",leaseToken=token,leaseUntil=(now+timedelta(seconds=540)).isoformat(),
                               updatedAt=now.isoformat(),attempt=doc["attempt"]+1))
            return {**doc,"leaseToken":token}
        return lease(self.db.transaction())

    def finish(self, job_id, status, token=None, error="", result_path=None):
        if status not in TERMINAL:
            raise ValueError("Invalid terminal state")
        ref = self.job_ref(job_id)
        @firestore.transactional
        def complete(tx):
            doc = ref.get(transaction=tx).to_dict()
            if not doc or doc["status"] in TERMINAL or (token and doc.get("leaseToken") != token):
                return False
            quota_ref = self.quota_ref(doc["uid"])
            quota = quota_ref.get(transaction=tx).to_dict() or {}
            active = quota.get("active",{})
            active.pop(job_id,None)
            patch = dict(status=status,updatedAt=now_iso(),error=error[:300])
            if result_path:
                patch["resultPath"] = result_path
            tx.update(ref,patch)
            tx.update(quota_ref,{"active":active})
            return True
        return complete(self.db.transaction())

    def list(self, uid, project_id):
        query = self.db.collection("geologicalJobs").where(filter=firestore.FieldFilter("uid","==",uid))
        query = query.where(filter=firestore.FieldFilter("projectId","==",project_id)).limit(100)
        docs = [(s.id,s.to_dict()) for s in query.stream()]
        return sorted(docs,key=lambda pair:pair[1]["createdAt"],reverse=True)

    def remove(self, uid, job_id):
        ref,quota_ref = self.job_ref(job_id),self.quota_ref(uid)
        @firestore.transactional
        def delete(tx):
            doc = ref.get(transaction=tx).to_dict()
            quota = quota_ref.get(transaction=tx).to_dict() or {}
            if not doc or doc.get("uid") != uid:
                raise StoreError(404,"Modelo não encontrado.")
            if doc["status"] not in TERMINAL:
                raise StoreError(409,"Cancele a execução antes de eliminar.")
            tx.delete(ref)
            tx.update(quota_ref,{"stored":max(0,quota.get("stored",1)-1)})
        delete(self.db.transaction())
