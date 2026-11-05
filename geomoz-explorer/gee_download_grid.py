"""Bound a direct GeoTIFF download before calling Earth Engine."""
import math


def bounded_download_grid(geometry, scale=30, max_pixels=900_000):
    if not isinstance(scale, (int, float)) or not math.isfinite(scale) or scale <= 0:
        raise ValueError("A resolução de download deve ser maior que zero.")
    if not isinstance(max_pixels, int) or not 10_000 <= max_pixels <= 4_000_000:
        raise ValueError("Limite de células inválido.")
    points = []

    def scan(value):
        if isinstance(value, dict):
            for key in ("coordinates", "geometry", "geometries", "features"):
                if key in value:
                    scan(value[key])
        elif isinstance(value, (list, tuple)):
            if len(value) >= 2 and all(isinstance(v, (int, float)) for v in value[:2]):
                points.append(value[:2])
            else:
                for child in value:
                    scan(child)

    scan(geometry)
    if not points or any(not math.isfinite(v) for point in points for v in point):
        raise ValueError("Desenhe uma área válida para descarregar o DEM.")
    west, south = (min(p[i] for p in points) for i in (0, 1))
    east, north = (max(p[i] for p in points) for i in (0, 1))
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90) or east - west > 180:
        raise ValueError("Extensão inválida. Escolha uma área local sem cruzar o antimeridiano.")
    metres_per_degree = 111319.49079327358
    effective = math.ceil(max(scale,
        math.sqrt((east-west) * (north-south) / max_pixels) * metres_per_degree * 1.02,
        (east-west) * metres_per_degree / 9998, (north-south) * metres_per_degree / 9998))
    while True:
        step = effective / metres_per_degree
        width, height = math.ceil((east-west)/step), math.ceil((north-south)/step)
        if width * height <= max_pixels and max(width, height) <= 9998:
            break
        effective += 1
    return {"requestedScale": scale, "scale": effective, "dimensions": [width, height],
            "crsTransform": [step, 0, west, 0, -step, north],
            "estimatedBytes": width * height * 4,
            "resolutionAdjusted": effective != scale}
