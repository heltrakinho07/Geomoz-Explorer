import {describe, expect, it} from "vitest";
import {parseRasterSourceExtent} from "../gis-raster-source-extent";

describe("raster source CRS extent", () => {
 it("preserves projected UTM coordinates and extent order", () => {
   expect(parseRasterSourceExtent(["450000","7100000","460000","7110000"]))
     .toEqual([450000,7100000,460000,7110000]);
 });
 it("accepts geographic coordinates including negative values", () => {
   expect(parseRasterSourceExtent(["33.2","-19.9","34.1","-19.1"]))
     .toEqual([33.2,-19.9,34.1,-19.1]);
 });
 it.each([
   ["", "0", "1", "2"], ["0","0","0","2"], ["2","1","1","2"],
   ["0","2","1","1"], ["NaN","0","1","2"], ["Infinity","0","1","2"],
   ["-overwrite","0","1","2"]
 ])("rejects invalid bounds", (...values) => {
   expect(() => parseRasterSourceExtent(values)).toThrow();
 });
});
