"""CPU-only GemPy adapter. No viewer, notebook or user-supplied code is run."""
import json
import sys
from importlib.metadata import version

import gempy as gp
import numpy as np
from gempy.core.color_generator import ColorsGenerator
from gempy.core.data.options import InterpolationOptionsType

from geological_model import parse_model, MAX_RESULT_BYTES


def build_model(spec):
    groups, layers, faults = [], [], []
    for unit in spec["interfaces"]:
        points = [p for p in spec["contacts"] if p["formation"] == unit["name"]]
        attitudes = [p for p in spec["orientations"] if p["formation"] == unit["name"]]
        azimuth = np.deg2rad([p["azimuth"] for p in attitudes])
        dip = np.deg2rad([p["dip"] for p in attitudes])
        polarity = np.array([p["polarity"] for p in attitudes])
        element = gp.data.StructuralElement(
            name=unit["name"], color=unit["color"],
            surface_points=gp.data.SurfacePointsTable.from_arrays(
                **{axis: np.array([p[axis] for p in points]) for axis in ("x", "y", "z")}, names=unit["name"]),
            orientations=gp.data.OrientationsTable.from_arrays(
                **{axis: np.array([p[axis] for p in attitudes]) for axis in ("x", "y", "z")},
                G_x=polarity * np.sin(dip) * np.sin(azimuth),
                G_y=polarity * np.sin(dip) * np.cos(azimuth),
                G_z=polarity * np.cos(dip), names=unit["name"]),
        )
        (faults if unit["kind"] == "fault" else layers).append(element)
    if faults:
        groups.append(gp.data.StructuralGroup(name="Fault", elements=faults,
                      structural_relation=gp.data.StackRelationType.FAULT,
                      fault_relations=gp.data.FaultsRelationSpecialCase.OFFSET_ALL))
    groups.append(gp.data.StructuralGroup(name="Stratigraphy", elements=layers,
                  structural_relation=gp.data.StackRelationType.ERODE))
    frame = gp.data.StructuralFrame(structural_groups=groups, color_gen=ColorsGenerator())
    model = gp.create_geomodel(project_name=spec["name"], extent=spec["extent"],
                              resolution=[spec["resolution"]] * 3, refinement=4,
                              structural_frame=frame,
                              intpolation_options_tye=InterpolationOptionsType.OCTREE)
    model.update_transform(gp.data.GlobalAnisotropy.NONE)
    return model


def compute(spec):
    model = build_model(spec)
    gp.compute_model(model, engine_config=gp.data.GemPyEngineConfig(
        backend=gp.data.AvailableBackends.numpy, use_gpu=False, dtype="float64"))
    # IDs are tied to the evaluated structural frame, which GemPy may reorder.
    elements = model.structural_frame.structural_elements
    units = [{"id": i + 1, "name": e.name, "color": e.color} for i, e in enumerate(elements)]
    values = np.asarray(model.solutions.raw_arrays.lith_block)
    if values.size != spec["resolution"] ** 3 or not np.isfinite(values).all():
        raise ValueError("GemPy devolveu uma grelha incompleta ou não finita.")
    ids = np.rint(values).astype(int)
    if not np.allclose(values, ids, atol=1e-5) or not set(ids.tolist()).issubset({u["id"] for u in units}):
        raise ValueError("Identificadores litológicos inesperados.")
    meshes = []
    for element in elements[:-1]:
        if isinstance(element.vertices, np.ndarray) and isinstance(element.edges, np.ndarray):
            if not np.isfinite(element.vertices).all():
                raise ValueError("Malha não finita.")
            meshes.append({"name": element.name, "color": element.color,
                           "vertices": element.vertices.round(6).tolist(), "triangles": element.edges.tolist()})
    # Dense grid centres, C order: ((ix * ny) + iy) * nz + iz. Z increases upwards.
    result = {"schemaVersion": 1, "input": spec, "engine": {"gempy": version("gempy"),
              "gempy_engine": version("gempy_engine"), "backend": "numpy", "dtype": "float64"},
              "grid": {"resolution": [spec["resolution"]] * 3, "extent": spec["extent"],
                       "order": "xyz-C", "sampling": "cell-centres", "lithology": ids.tolist()},
              "units": units, "meshes": meshes,
              "interpretation": "Modelo interpolado a partir de contactos, orientações e hipóteses estratigráficas; não é uma observação directa do subsolo."}
    encoded = json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
    if len(encoded) > MAX_RESULT_BYTES:
        raise ValueError("Resultado excede o limite de 16 MB.")
    return encoded


if __name__ == "__main__":
    with open(sys.argv[1], "rb") as source:
        spec = parse_model(source.read(1_000_001))
    output = compute(spec)
    with open(sys.argv[2], "wb") as target:
        target.write(output)
