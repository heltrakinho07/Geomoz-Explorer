"""Offline numerical regression checks; no claim of live Earth Engine validation."""
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gee_module as gm


class Scalar:
    def __init__(self, value): self.value = value
    def _v(self, x): return x.value if isinstance(x, Scalar) else x
    def add(self, x): return Scalar(self.value + self._v(x))
    def subtract(self, x): return Scalar(self.value - self._v(x))
    def multiply(self, x): return Scalar(self.value * self._v(x))
    def divide(self, x): return Scalar(self.value / self._v(x))
    def pow(self, x): return Scalar(self.value ** self._v(x))
    def sqrt(self): return Scalar(self.value ** .5)
    def eq(self, x): return Scalar(self.value == self._v(x))
    def neq(self, x): return Scalar(self.value != self._v(x))
    def gte(self, x): return Scalar(self.value >= self._v(x))
    def gt(self, x): return Scalar(self.value > self._v(x))
    def lt(self, x): return Scalar(self.value < self._v(x))
    def lte(self, x): return Scalar(self.value <= self._v(x))
    def And(self, x): return Scalar(bool(self.value and self._v(x)))
    def bitwiseAnd(self, x): return Scalar(int(self.value) & x)
    def rightShift(self, x): return Scalar(int(self.value) >> x)
    def rename(self, *_): return self
    def updateMask(self, mask): return self if mask.value else Scalar(float('nan'))
    def expression(self, _, values):
        d = values['d'].value
        return Scalar(next((i for i, threshold in enumerate([-.1, .1, .27, .44, .66]) if d < threshold), 5))


class Bands:
    def __init__(self, **bands): self.bands = bands
    def select(self, name): return Scalar(self.bands[name])
    def normalizedDifference(self, names):
        a,b = [self.bands[n] for n in names]
        return Scalar((a-b)/(a+b))


class Collection:
    def __init__(self, images): self.images = images
    def map(self, func): return Collection([func(i) for i in self.images])
    def mean(self): return Scalar(sum(i.value for i in self.images)/len(self.images))
    def select(self, name): return Collection([i.select(name) for i in self.images])
    def sum(self): return Scalar(sum(i.value for i in self.images))


class ScientificIndicesTests(unittest.TestCase):
    def setUp(self):
        self.ee = patch.dict(sys.modules, {'ee': types.SimpleNamespace()})
        self.ee.start()
    def tearDown(self): self.ee.stop()

    def test_registry_coverage_and_frontend_parity(self):
        root = Path(__file__).resolve().parents[2]
        frontend = json.loads((root/'artifacts/geomoz-react/src/lib/index-science.json').read_text())
        self.assertEqual(frontend, gm.INDEX_SCIENCE)
        self.assertTrue(set(gm.INDEX_REGISTRY) <= set(frontend))

    def test_every_unvalidated_index_is_rejected(self):
        for index, meta in gm.INDEX_SCIENCE.items():
            if meta['status'] == 'experimental':
                with self.subTest(index=index), self.assertRaisesRegex(ValueError,'não validada'):
                    gm._build_index_image(index, None)

    def test_nbr_and_dnbr_are_different_quantities(self):
        post = Bands(B8=.3, B12=.5)
        self.assertAlmostEqual(gm._build_index_image('nbr',None,s2=post).value,-.25)
        with patch.object(gm,'_build_s2_composite',return_value=(Bands(B8=.8,B12=.2),5)) as build:
            result=gm._build_index_image('dnbr',None,s2=post,start_date='2023-08-01',end_date='2023-09-01',pre_start_date='2023-06-01',pre_end_date='2023-07-01')
            self.assertAlmostEqual(result.value,.85)
            self.assertEqual(build.call_args.args[1:3],('2023-06-01','2023-07-01'))
            severity=gm._build_index_image('burn_severity',None,s2=post,start_date='2023-08-01',end_date='2023-09-01',pre_start_date='2023-06-01',pre_end_date='2023-07-01')
            self.assertEqual(severity.value,5)

    def test_pre_period_required_and_nonoverlapping(self):
        with self.assertRaisesRegex(ValueError,'explícitos'):
            gm._build_index_image('dnbr',None)
        with self.assertRaisesRegex(ValueError,'sobrepor'):
            gm._build_index_image('dnbr',None,pre_start_date='2023-01-01',pre_end_date='2023-06-01')
        with self.assertRaises(ValueError): gm.validate_period('2023-02-01','2023-01-01')

    def test_lst_kelvin_to_celsius_and_requested_dates(self):
        with patch.object(gm,'_checked_collection',return_value=Collection([Bands(LST_Day_1km=15000,QC_Day=0)])) as col:
            out=gm._build_index_image('temperature_lst',None,start_date='2024-05-01',end_date='2024-06-01')
            self.assertAlmostEqual(out.value,26.85)
            self.assertEqual(col.call_args.args[-2:],('2024-05-01','2024-06-01'))

    def test_wind_magnitudes_not_magnitude_of_mean_vector(self):
        images=[Bands(u_component_of_wind_10m=3,v_component_of_wind_10m=4),Bands(u_component_of_wind_10m=-3,v_component_of_wind_10m=-4)]
        with patch.object(gm,'_checked_collection',return_value=Collection(images)):
            self.assertEqual(gm._build_index_image('wind_speed',None).value,5)

    def test_hansen_rejects_false_temporal_coverage(self):
        for start,end in [('2025-01-01','2026-01-01'),('2023-02-01','2024-01-01')]:
            with self.assertRaises(ValueError):
                gm._build_index_image('forest_loss',None,start_date=start,end_date=end)

    def test_qa60_gap_not_used_and_landsat_scaling_once(self):
        import inspect
        self.assertIn('SCL', inspect.getsource(gm._mask_s2_clouds))
        self.assertNotIn('select("QA60")', inspect.getsource(gm._mask_s2_clouds))
        self.assertIn('multiply(0.0000275).add(-0.2)', inspect.getsource(gm._mask_l8_clouds))

if __name__=='__main__': unittest.main()
