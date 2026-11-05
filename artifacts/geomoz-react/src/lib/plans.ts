/** GeoMoz Explorer pricing catalogue. Money is in integer MZN; processing credits are NOT Earth Engine quotas. */
export type PlanId = "community" | "academic" | "pro" | "teams" | "enterprise";
export type PlanFeature = "local_gis" | "scientific_analysis" | "advanced_exports" | "cloud_jobs" | "gee_terrain_pro" | "collaboration" | "institutional_api";
export interface GeoMozPlan {
  id: PlanId; name: string; audience: string; monthlyMzn: number | null; yearlyMzn: number | null;
  projects: number | null; storageBytes: number | null; credits: number | null;
  seats: number | null; concurrentJobs: number | null; features: PlanFeature[];
}
const GB = 1024 ** 3;
export const PLANS: Record<PlanId, GeoMozPlan> = {
  community: { id:"community", name:"Community", audience:"Utilização individual", monthlyMzn:0, yearlyMzn:0, projects:3,storageBytes:0.5*GB,credits:20,seats:1,concurrentJobs:1,features:["local_gis"] },
  academic: { id:"academic", name:"Academic", audience:"Estudantes e investigadores elegíveis",monthlyMzn:299,yearlyMzn:2990,projects:15,storageBytes:5*GB,credits:150,seats:1,concurrentJobs:1,features:["local_gis","scientific_analysis","cloud_jobs"] },
  pro: { id:"pro",name:"Pro",audience:"Profissionais SIG",monthlyMzn:1199,yearlyMzn:11990,projects:75,storageBytes:30*GB,credits:800,seats:1,concurrentJobs:2,features:["local_gis","scientific_analysis","cloud_jobs","gee_terrain_pro","advanced_exports"] },
  teams: { id:"teams",name:"Teams",audience:"Equipas até cinco utilizadores",monthlyMzn:4999,yearlyMzn:49990,projects:200,storageBytes:150*GB,credits:3000,seats:5,concurrentJobs:5,features:["local_gis","scientific_analysis","cloud_jobs","gee_terrain_pro","advanced_exports","collaboration"] },
  enterprise: { id:"enterprise",name:"Enterprise",audience:"Organizações e instituições",monthlyMzn:null,yearlyMzn:null,projects:null,storageBytes:null,credits:null,seats:null,concurrentJobs:null,features:["local_gis","scientific_analysis","cloud_jobs","gee_terrain_pro","advanced_exports","collaboration","institutional_api"] }
};
export const PLAN_ORDER: PlanId[] = ["community","academic","pro","teams","enterprise"];
export function isPlanId(value: unknown): value is PlanId {return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLANS,value);}
export function hasPlanFeature(id: PlanId, feature: PlanFeature): boolean {return PLANS[id].features.includes(feature);}
export const formatMzn = (value: number) => new Intl.NumberFormat("pt-PT", {maximumFractionDigits:0}).format(value)+" MZN";
