from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta,timezone
import os
from pathlib import Path
import sys
import uuid
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'geomoz-explorer'))
from geological_store import GeologicalStore,StoreError
from geological_examples import example_model
pytestmark=pytest.mark.skipif(not os.getenv('FIRESTORE_EMULATOR_HOST'),reason='Firestore emulator required')

@pytest.fixture
def state():
    from google.cloud.firestore import Client
    db=Client(project='demo-geomoz-geology');uid=uuid.uuid4().hex
    db.collection('users').document(uid).collection('projects').document('p').set({'name':'Test'})
    return GeologicalStore(db),uid

def test_contention_and_cancellation(state):
    store,uid=state
    with ThreadPoolExecutor(max_workers=4) as pool: results=list(pool.map(lambda _:store.allocate(uid,'p','a'*32,'digest',example_model(),10),range(4)))
    assert len({j for j,_ in results})==1 and sum(c for _,c in results)==1
    ident=results[0][0];assert store.quota_ref(uid).get().to_dict()['monthlyCount']==1
    lease=store.claim(ident)
    with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda _:store.finish(ident,'cancelled'),range(2)))
    assert not store.finish(ident,'succeeded',lease['leaseToken'])
    assert store.owned(uid,ident)['status']=='cancelled' and store.quota_ref(uid).get().to_dict()['active']=={}
    assert store.list(uid,'p')[0][0]==ident
    with pytest.raises(StoreError):store.owned('intruder',ident)
    store.remove(uid,ident);assert store.quota_ref(uid).get().to_dict()['stored']==0

def test_quota_and_stale_lease(state):
    store,uid=state;j,_=store.allocate(uid,'p','a'*32,'d',example_model(),2)
    with pytest.raises(StoreError):store.allocate(uid,'p','b'*32,'d',example_model(),2)
    with pytest.raises(StoreError):store.allocate(uid,'p','a'*32,'changed',example_model(),2)
    first=store.claim(j);assert store.claim(j)=='busy'
    store.job_ref(j).update({'leaseUntil':(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()})
    second=store.claim(j);assert not store.finish(j,'succeeded',first['leaseToken'])
    assert store.finish(j,'succeeded',second['leaseToken'],result_path='private/result.json')
    j2,_=store.allocate(uid,'p','b'*32,'d',example_model(),2);store.finish(j2,'failed')
    with pytest.raises(StoreError):store.allocate(uid,'p','c'*32,'d',example_model(),2)
    with pytest.raises(StoreError):store.allocate(uid,'missing','z'*32,'d',example_model(),200)
