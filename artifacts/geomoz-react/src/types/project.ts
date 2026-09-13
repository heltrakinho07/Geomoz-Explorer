import type { AreaOfInterest } from "../lib/aoi";

export type ProjectCategory =
  | "agricultura"
  | "recursos_hidricos"
  | "ordenamento_territorial"
  | "geoperigos"
  | "conservacao_ambiental"
  | "estudo_geral";

export interface ProjectCategoryMeta {
  id: ProjectCategory;
  labelPt: string;
  labelEn: string;
  iconName: string;
  color: string;
  badgeBg: string;
  descriptionPt: string;
}

export const PROJECT_CATEGORIES: ProjectCategoryMeta[] = [
  {
    id: "agricultura",
    labelPt: "Agricultura & Segurança Alimentar",
    labelEn: "Agriculture & Food Security",
    iconName: "Sprout",
    color: "text-emerald-600 dark:text-emerald-400",
    badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800",
    descriptionPt: "Monitorização de culturas, anomalias de vigor vegetal (NDVI/EVI) e stress hídrico.",
  },
  {
    id: "recursos_hidricos",
    labelPt: "Recursos Hídricos & Aquíferos",
    labelEn: "Water Resources & Aquifers",
    iconName: "Droplets",
    color: "text-cyan-600 dark:text-cyan-400",
    badgeBg: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/70 dark:text-cyan-300 dark:border-cyan-800",
    descriptionPt: "Delineação de bacias hidrográficas, drenagem D8 e potencial de água subterrânea AHP.",
  },
  {
    id: "ordenamento_territorial",
    labelPt: "Ordenamento & Gestão Municipal",
    labelEn: "Spatial Planning & Urban Management",
    iconName: "Building2",
    color: "text-indigo-600 dark:text-indigo-400",
    badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800",
    descriptionPt: "Cartografia de expansão urbana, infraestruturas e declividades para planeamento.",
  },
  {
    id: "geoperigos",
    labelPt: "Geoperigos & Desastres Naturais",
    labelEn: "Geohazards & Disaster Risk",
    iconName: "AlertTriangle",
    color: "text-amber-600 dark:text-amber-400",
    badgeBg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800",
    descriptionPt: "Deteção de cheias via radar SAR Sentinel-1, deslizamentos e anomalias térmicas.",
  },
  {
    id: "conservacao_ambiental",
    labelPt: "Conservação & Florestas",
    labelEn: "Environmental Conservation & Forestry",
    iconName: "Leaf",
    color: "text-teal-600 dark:text-teal-400",
    badgeBg: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/70 dark:text-teal-300 dark:border-teal-800",
    descriptionPt: "Vigilância de mangais, desflorestação, regeneração natural e biomas protegidos.",
  },
  {
    id: "estudo_geral",
    labelPt: "Investigação & Estudo Geral",
    labelEn: "Research & General Study",
    iconName: "Globe",
    color: "text-sky-600 dark:text-sky-400",
    badgeBg: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800",
    descriptionPt: "Projetos académicos e exploração multifatorial de dados geoespaciais.",
  },
];

export interface StudyRunMetrics {
  min?: number;
  max?: number;
  mean?: number;
  stdDev?: number;
  unit?: string;
  cloudCoverPercentage?: number;
  sampledPoints?: number;
}

export interface StudyRun {
  id: string;
  projectId: string;
  name: string;
  type: "remote_sensing" | "hydro" | "groundwater" | "hazards" | "ai" | "custom";
  sensor: string;
  code: string;
  formula?: string;
  dateRange: {
    start: string;
    end: string;
  };
  metrics?: StudyRunMetrics;
  histogram?: { bin: string; count: number }[];
  tileUrl?: string;
  notes?: string;
  createdAt: string; // ISO String
}

export interface GeoMozProject {
  id: string;
  userId: string;
  name: string;
  description: string;
  category: ProjectCategory;
  aoi: AreaOfInterest;
  period: {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
  };
  statsSummary?: {
    totalRuns: number;
    lastAnalysisType?: string;
    lastRunAt?: string;
  };
  createdAt: string; // ISO String
  updatedAt: string; // ISO String
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  category: ProjectCategory;
  aoi: AreaOfInterest;
  period: {
    startDate: string;
    endDate: string;
  };
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  category?: ProjectCategory;
  aoi?: AreaOfInterest;
  period?: {
    startDate: string;
    endDate: string;
  };
}
