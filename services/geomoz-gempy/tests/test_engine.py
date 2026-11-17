import json
import sys
from pathlib import Path
import numpy as np
import pytest
ROOT=Path(__file__).resolve().parents[3]
sys.path[:0]=[str(ROOT/'geomoz-explorer'),str(ROOT/'services/geomoz-gempy')]
from geological_examples import example_model
from geological_model import validate_model,parse_model,InvalidModel
from engine import compute

@pytest.fixture(scope='module',params=[False,True])
def result(request):
    return request.param,json.loads(compute(validate_model(example_model(request.param))))

def cell(r,x,y,z):
    n=r['input']['resolution'];a=[min(n-1,int(v/1000*n)) for v in (x,y,z)]
    return r['grid']['lithology'][(a[0]*n+a[1])*n+a[2]]

def test_reference_lithology_and_world_meshes(result):
    fault,r=result;ids={u['name']:u['id'] for u in r['units']}
    if fault:
        assert cell(r,100,500,700)==ids['rock1']
        assert cell(r,900,500,700)==ids['rock2']
        assert cell(r,100,500,500)==ids['basement']
        assert cell(r,900,500,300)==ids['rock1']
    else:
        for x in (150,500,850):
            for y in (150,500,850):
                assert cell(r,x,y,800)==ids['rock2']
                assert cell(r,x,y,500)==ids['rock1']
                assert cell(r,x,y,200)==ids['basement']
    assert len(r['meshes'])==(3 if fault else 2)
    for mesh in r['meshes']:
        v=np.array(mesh['vertices']);assert np.isfinite(v).all() and v.shape[1]==3
        assert np.array(mesh['triangles']).max()<len(v)
        if not fault: assert np.abs(v[:,2]-(600 if mesh['name']=='rock2' else 400)).max()<2
    assert r['engine']['gempy']=='2026.0.3'

def test_roundtrip(result):
    _,r=result;again=json.loads(compute(parse_model(json.dumps(r['input']).encode())))
    assert again['grid']==r['grid'] and again['meshes']==r['meshes']

def test_projected_coordinates():
    spec=example_model();original=json.loads(compute(spec));dx,dy=500000,7500000
    spec['crs']='EPSG:32736';spec['extent']=[dx,dx+1000,dy,dy+1000,0,1000]
    for p in spec['contacts']+spec['orientations']:p['x']+=dx;p['y']+=dy
    shifted=json.loads(compute(validate_model(spec)))
    assert shifted['grid']['lithology']==original['grid']['lithology']
    for a,b in zip(original['meshes'],shifted['meshes']):np.testing.assert_allclose(np.array(b['vertices'])-[dx,dy,0],a['vertices'],atol=1e-5)

@pytest.mark.parametrize('mutate',[
 lambda s:s.update(crs='EPSG:4326'),lambda s:s.update(resolution=256),lambda s:s.update(resolution=True),lambda s:s.update(schemaVersion=True),
 lambda s:s.update(code='import os'),lambda s:s['contacts'][0].update(x=float('nan')),lambda s:s['contacts'][0].update(formation=[]),
 lambda s:s['contacts'][0].update(x=1001),lambda s:s['contacts'].append(s['contacts'][0]),lambda s:s['orientations'][0].update(dip=91),
 lambda s:s['orientations'][0].update(azimuth=360),lambda s:s['orientations'][0].update(polarity=0),lambda s:s.update(extent=[0,0,0,1000,0,1000]),
 lambda s:s['interfaces'][0].update(kind='unconformity'),lambda s:s['interfaces'][0].update(name='basement')])
def test_invalid_inputs(mutate):
    spec=example_model();mutate(spec)
    with pytest.raises(InvalidModel):validate_model(spec)

def test_collinear_and_oversized():
    spec=example_model()
    for p in spec['contacts']:p['y']=100
    with pytest.raises(InvalidModel):validate_model(spec)
    with pytest.raises(InvalidModel):parse_model(b' '*1000001)
