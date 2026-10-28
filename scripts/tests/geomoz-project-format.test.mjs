import test from "node:test";
import assert from "node:assert/strict";
import {geomozProjectFileName} from "../assets/workbench/geomoz-project-filename.ts";

test("new and legacy project names save with the GeoMoz extension",()=>{
 for(const input of ["", "  ", "Untitled Project", "Untitled Project.geolibre", "Untitled Projecto", "Untitled_Projecto.geomoz"])
   assert.equal(geomozProjectFileName(input),"Untitled_Projecto.geomoz",input);
 for(const input of ["Mapa de Manica", "Mapa de Manica.geolibre", "Mapa de Manica.geolibre.json", "Mapa de Manica.json", "Mapa de Manica.GEOMOZ"])
   assert.equal(geomozProjectFileName(input),"Mapa_de_Manica.geomoz",input);
 assert.equal(geomozProjectFileName("..."),"Untitled_Projecto.geomoz");
 assert.equal(geomozProjectFileName("Mapa: Manica?"),"Mapa__Manica_.geomoz");
});
