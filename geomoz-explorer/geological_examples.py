"""Synthetic teaching models, matching GemPy jan_models/model1 and model5 geometry."""
SOURCE = "https://github.com/cgre-aachen/gempy_data/tree/master/data/input_data/jan_models"


def example_model(fault=False):
    contacts, orientations = [], []
    interfaces = [{"name": "rock2", "kind": "layer", "color": "#edb769"},
                  {"name": "rock1", "kind": "layer", "color": "#62b9ad"}]
    for name, z in (("rock2", 600), ("rock1", 400)):
        for x in (0, 200, 800, 1000):
            height = z + (200 if x < 500 else -200) if fault else z
            for y in (200, 800):
                contacts.append(dict(x=x, y=y, z=height, formation=name))
        for x in (100, 900):
            height = z + (200 if x < 500 else -200) if fault else z
            orientations.append(dict(x=x, y=500, z=height, formation=name, azimuth=90, dip=0, polarity=1))
    if fault:
        interfaces.insert(0, dict(name="fault", kind="fault", color="#ef6b73"))
        for x,z in ((500,500),(450,600)):
            for y in (200,500,800):
                contacts.append(dict(x=x,y=y,z=z,formation="fault"))
        orientations.append(dict(x=500,y=500,z=500,formation="fault",azimuth=90,dip=60,polarity=1))
    return dict(schemaVersion=1,name="Falha simples" if fault else "Estratos horizontais",crs="LOCAL",
                extent=[0,1000,0,1000,0,1000],resolution=24,interfaces=interfaces,contacts=contacts,orientations=orientations)
