import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from fastapi import FastAPI,HTTPException
from fastapi.testclient import TestClient
ROOT=Path(__file__).resolve().parents[3]
sys.path[:0]=[str(ROOT/'geomoz-explorer'),str(ROOT/'services/geomoz-gempy')]
import geological_gateway as gateway
import service
from geological_examples import example_model
from geological_store import StoreError

@pytest.fixture
def client(monkeypatch):
    app=FastAPI();app.include_router(gateway.router);app.dependency_overrides[gateway._uid]=lambda:'alice'
    monkeypatch.setattr(gateway,'require_plan_feature',lambda *_:'pro')
    return TestClient(app)

def configure(monkeypatch):
    for k,v in dict(ENABLED='true',BUCKET='private',QUEUE='projects/p/locations/r/queues/q',WORKER_URL='https://worker.run.app',TASK_ACCOUNT='tasks@p.iam.gserviceaccount.com').items():monkeypatch.setenv('GEOMOZ_GEOLOGY_'+k,v)

def test_unconfigured_and_examples(client,monkeypatch):
    monkeypatch.delenv('GEOMOZ_GEOLOGY_ENABLED',raising=False)
    assert client.get('/geomoz-api/geology/capabilities').json()['canCompute'] is False
    assert client.get('/geomoz-api/geology/examples/fault').json()['interfaces'][0]['kind']=='fault'
    assert client.post('/geomoz-api/geology/jobs?project_id=p',json=example_model()).status_code==503

def test_create_private_and_cancel(client,monkeypatch):
    configure(monkeypatch);ident='a'*32
    doc=dict(uid='alice',projectId='p',name='Model',status='queued',deadline='9999',inputPath='private/input.json',error='')
    store=Mock();store.allocate.return_value=(ident,True);store.owned.return_value=doc
    monkeypatch.setattr(gateway,'store',lambda:store);bucket=Mock();monkeypatch.setattr(gateway,'bucket',lambda:bucket)
    enqueue=Mock();monkeypatch.setattr(gateway,'enqueue',enqueue)
    response=client.post('/geomoz-api/geology/jobs?project_id=p',headers={'Idempotency-Key':'x'*32},json=example_model())
    assert response.status_code==202 and response.json()['id']==ident
    assert 'uid' not in response.json() and 'inputPath' not in response.json()
    assert store.allocate.call_args.args[0:2]==('alice','p')
    assert bucket.blob.return_value.upload_from_string.call_args.kwargs['if_generation_match']==0
    assert enqueue.call_count==1
    assert client.post(f'/geomoz-api/geology/jobs/{ident}/cancel').status_code==200
    store.finish.assert_called_with(ident,'cancelled')

def test_wrong_owner_hidden(client,monkeypatch):
    store=Mock();store.owned.side_effect=StoreError(404,'Modelo não encontrado.');monkeypatch.setattr(gateway,'store',lambda:store)
    for suffix in ('','/input','/result'):
        assert client.get('/geomoz-api/geology/jobs/'+'b'*32+suffix).status_code==404

def test_limits_and_plan(client,monkeypatch):
    configure(monkeypatch)
    assert client.post('/geomoz-api/geology/jobs?project_id=p',headers={'Idempotency-Key':'x'*32},content=' '*1000001).status_code==413
    def deny(*_):raise HTTPException(403,'Plan')
    monkeypatch.setattr(gateway,'require_plan_feature',deny)
    assert client.post('/geomoz-api/geology/jobs?project_id=p',json=example_model()).status_code==403

def test_enqueue_failure_releases_quota(client,monkeypatch):
    configure(monkeypatch);store=Mock();store.allocate.return_value=('a'*32,True);store.owned.return_value=dict(status='queued',deadline='9999',inputPath='p/input.json')
    monkeypatch.setattr(gateway,'store',lambda:store);monkeypatch.setattr(gateway,'bucket',lambda:Mock())
    monkeypatch.setattr(gateway,'enqueue',Mock(side_effect=RuntimeError('unavailable')))
    response=client.post('/geomoz-api/geology/jobs?project_id=p',headers={'Idempotency-Key':'x'*32},json=example_model())
    assert response.status_code==503 and store.finish.call_args.args[1]=='failed'

def test_private_worker_identity(monkeypatch):
    monkeypatch.setenv('GEOMOZ_GEOLOGY_WORKER_URL','https://worker.run.app');monkeypatch.setenv('GEOMOZ_GEOLOGY_TASK_ACCOUNT','expected')
    client=TestClient(service.app)
    assert client.post('/tasks/compute',json={'jobId':'a'*32}).status_code==401
    monkeypatch.setattr(service.id_token,'verify_oauth2_token',lambda *a,**k:dict(email='wrong',email_verified=True,iss='accounts.google.com'))
    assert client.post('/tasks/compute',headers={'Authorization':'Bearer fake'},json={'jobId':'a'*32}).status_code==403
