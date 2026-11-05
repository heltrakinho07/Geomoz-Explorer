import {describe, expect, it} from "vitest";
import {PLANS, PLAN_ORDER, hasPlanFeature, isPlanId} from "../plans";

describe("GeoMoz subscription catalogue",()=>{
  it("lists all five plans with consistent monthly and annual prices",()=>{
    expect(PLAN_ORDER).toHaveLength(5);
    for(const id of PLAN_ORDER){
      expect(PLANS[id].id).toBe(id);
      if(id!=="enterprise"){
        expect(PLANS[id].yearlyMzn).toBeLessThanOrEqual((PLANS[id].monthlyMzn??0)*12);
        expect(PLANS[id].credits).toBeGreaterThan(0);
      }
    }
  });
  it("does not enable paid cloud jobs for the community plan",()=>{
    expect(hasPlanFeature("community","local_gis")).toBe(true);
    expect(hasPlanFeature("community","cloud_jobs")).toBe(false);
    expect(hasPlanFeature("academic","scientific_analysis")).toBe(true);
  });
  it("reserva a aquisição GEE de DEM aos planos Pro e superiores",()=>{
    expect(hasPlanFeature("community","gee_terrain_pro")).toBe(false);
    expect(hasPlanFeature("academic","gee_terrain_pro")).toBe(false);
    for(const id of ["pro","teams","enterprise"] as const)
      expect(hasPlanFeature(id,"gee_terrain_pro")).toBe(true);
  });
  it("rejects unknown plan identifiers",()=>{
    expect(isPlanId("enterprise")).toBe(true);
    expect(isPlanId("unlimited")).toBe(false);
    expect(isPlanId("__proto__")).toBe(false);
  });
});
