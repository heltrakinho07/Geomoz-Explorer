import { describe, expect, it } from "vitest";
import { xyzTilePosition, chooseXYZTiles, validLicensedXYZTemplate } from "../terrain-texture-stack";
describe("GeoMoz DEM texture stacking / licensed basemap sampling",()=>{
  it("uses valid tile XY positions across hemispheres",()=>{
    expect(xyzTilePosition(0,0,2)).toEqual([2,2]);
    const [x,y]=xyzTilePosition(33,-19,10);
    expect(x).toBeGreaterThan(500);expect(y).toBeGreaterThan(500);
  });
  it("limits per-action XYZ tiles and uses a bounded zoom level",()=>{
    const selected=chooseXYZTiles([32.9,-19.8,33.1,-19.4]);
    expect(selected.count).toBeGreaterThan(0);
    expect(selected.count).toBeLessThanOrEqual(12);
    expect(selected.zoom).toBeLessThanOrEqual(15);
  });
  it("rejects unsupported mosaics and OSMF community tile server",()=>{
    expect(validLicensedXYZTemplate("http://host.test/{z}/{x}/{y}.png")).toBe(false);
    expect(validLicensedXYZTemplate("https://tile.openstreetmap.org/{z}/{x}/{y}.png")).toBe(false);
    expect(validLicensedXYZTemplate("https://tiles.example.com/{z}/{x}/{y}.png")).toBe(true);
    expect(()=>chooseXYZTiles([170,-10,-170,10])).toThrow();
  });
});
