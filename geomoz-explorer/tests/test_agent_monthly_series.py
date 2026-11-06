"""Monthly GEE series contracts without external RPCs."""
import unittest
from unittest.mock import patch

from agent import earth_engine_tools as engine
from agent.monthly_time_windows import month_slices


class MonthlySeriesTests(unittest.TestCase):
    def test_month_intervals_are_calendar_aligned_with_exclusive_end(self):
        self.assertEqual(month_slices("2020-01-20", "2020-03-01"), [
            {"month": "2020-01", "startDate": "2020-01-20", "endDate": "2020-02-01"},
            {"month": "2020-02", "startDate": "2020-02-01", "endDate": "2020-03-01"},
        ])
        self.assertEqual(len(month_slices("2020-01-01", "2021-01-01")), 12)

    def test_missing_month_is_null_not_a_fabricated_zero(self):
        def mock_image(region, index, start, end, cloud):
            if start.startswith("2020-02"):
                raise ValueError("Sem cenas Sentinel-2 no período/AOI e limiar de nuvens seleccionados.")
            return ("image", 3)

        with patch.object(engine, "_grid", return_value=("region", {"scale": 30}, 1000)), \
             patch.object(engine, "_s2_image", side_effect=mock_image), \
             patch.object(engine, "_summary", return_value={"mean": 0.0, "count": 10}):
            data = engine.temporal_monthly_series("area", "ndvi",
                "2020-01-01", "2020-03-01", "2025-01-01", "2025-03-01")
        self.assertEqual(data["months"]["A"][0]["mean"], 0.0)
        self.assertIsNone(data["months"]["A"][1]["mean"])
        self.assertEqual(data["months"]["A"][1]["sceneCount"], 0)
        self.assertEqual(data["months"]["B"][0]["validPixelCount"], 10)

    def test_rejects_overlong_and_overlapping_periods(self):
        with self.assertRaisesRegex(ValueError, "12 meses"):
            engine.temporal_monthly_series("area", "ndvi",
                "2020-01-01", "2021-02-01", "2025-01-01", "2026-01-01")
        with self.assertRaises(ValueError):
            engine.temporal_monthly_series("area", "ndvi",
                "2020-01-01", "2021-01-01", "2020-06-01", "2021-06-01")


if __name__ == "__main__":
    unittest.main()
