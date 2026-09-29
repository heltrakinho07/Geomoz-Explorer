/**
 * Solar Simulation & Dynamic 3D Shadows
 *
 * Calculates solar position (azimuth, elevation, polar angle), direct sunlight colors,
 * atmospheric sky gradients, and hillshade shadow illumination direction for MapLibre 3D DEM.
 */

export interface SolarState {
  /** Decimal hour from 0 to 24 (e.g. 17.5 = 17:30) */
  hour: number;
  /** Formatted HH:mm string */
  timeString: string;
  /** Sun azimuth in degrees (0 = North, 90 = East, 180 = South, 270 = West) */
  azimuth: number;
  /** Solar elevation above horizon in degrees (-90 to +90) */
  elevation: number;
  /** Polar angle in degrees for MapLibre light position (0 = Zenith, 90 = Horizon, 180 = Nadir) */
  polarAngle: number;
  /** Light intensity 0.0 to 1.0 */
  lightIntensity: number;
  /** Sun/ambient light color hex */
  lightColor: string;
  /** Sky dome color hex */
  skyColor: string;
  /** Horizon fog/atmosphere color hex */
  horizonColor: string;
  /** Fog haze color hex */
  fogColor: string;
  /** Hillshade shadow color */
  shadowColor: string;
  /** Hillshade shadow exaggeration / intensity (0 to 1) */
  shadowExaggeration: number;
  /** Whether 3D dynamic hillshade shadows are enabled */
  shadowEnabled: boolean;
  /** Optional active preset identifier */
  presetKey?: SolarPresetKey;
}

export type SolarPresetKey = "dawn" | "noon" | "golden" | "dusk" | "night";

export interface SolarPreset {
  id: SolarPresetKey;
  label: string;
  timeString: string;
  hour: number;
  icon: string;
  description: string;
}

export const SOLAR_PRESETS: SolarPreset[] = [
  {
    id: "dawn",
    label: "Amanhecer",
    timeString: "06:30",
    hour: 6.5,
    icon: "sunrise",
    description: "Luz suave matinal, tons rosados e sombras longas a este",
  },
  {
    id: "noon",
    label: "Meio-Dia",
    timeString: "12:00",
    hour: 12.0,
    icon: "sun",
    description: "Sol zenital brilhante, contraste máximo e sombras mínimas",
  },
  {
    id: "golden",
    label: "Golden Hour",
    timeString: "17:15",
    hour: 17.25,
    icon: "sparkles",
    description: "Tons dourados quentes que destacam vertentes e relevo escarpado",
  },
  {
    id: "dusk",
    label: "Pôr do Sol",
    timeString: "18:45",
    hour: 18.75,
    icon: "sunset",
    description: "Céu crepuscular rubro-violeta e relevo acentuado a poente",
  },
  {
    id: "night",
    label: "Luar / Noite",
    timeString: "22:00",
    hour: 22.0,
    icon: "moon",
    description: "Iluminação lunar fria e sombras etéreas no terreno",
  },
];

export function formatTime(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const h = Math.floor(normalized);
  const m = Math.floor((normalized - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Computes solar elevation and azimuth based on standard solar arc.
 * Dawn at ~06:00, solar noon at 12:00, dusk at ~18:00.
 */
export function calculateSolarState(
  hour: number,
  shadowEnabled: boolean = true,
  presetKey?: SolarPresetKey
): SolarState {
  const normalizedHour = ((hour % 24) + 24) % 24;

  // Elevation (-90 to +90 deg):
  // Peak +70° at 12:00, 0° at 06:00 and 18:00, nadir -50° at 00:00
  const angle = ((normalizedHour - 6) / 12) * Math.PI;
  const elevation = Math.sin(angle) * 72;

  // Azimuth (0° = North, 90° = East, 180° = South, 270° = West):
  // 06:00 -> ~80° (ENE), 12:00 -> ~180° (S), 18:00 -> ~280° (WNW)
  let azimuth: number;
  if (normalizedHour >= 6 && normalizedHour <= 18) {
    // Daytime: smooth traversal from East to West across South
    const t = (normalizedHour - 6) / 12;
    azimuth = 75 + t * 210; // 75° to 285°
  } else {
    // Nighttime: traversal from West to East across North
    const t = normalizedHour > 18 ? (normalizedHour - 18) / 12 : (normalizedHour + 6) / 12;
    azimuth = (285 + t * 150) % 360;
  }

  // MapLibre light polar angle: 0 = zenith (directly above), 90 = horizon, 180 = nadir
  const polarAngle = Math.max(5, Math.min(175, 90 - elevation));

  // Determine atmospheric colors based on elevation
  let lightColor: string;
  let skyColor: string;
  let horizonColor: string;
  let fogColor: string;
  let shadowColor: string;
  let lightIntensity: number;
  let shadowExaggeration: number;

  if (elevation > 25) {
    // Bright Daylight
    lightColor = "#ffffff";
    skyColor = "#38bdf8";
    horizonColor = "#e0f2fe";
    fogColor = "#bae6fd";
    shadowColor = "#0f172a";
    lightIntensity = 0.95;
    shadowExaggeration = 0.45;
  } else if (elevation > 8) {
    // Golden Hour / Morning Sunlight
    const factor = (elevation - 8) / (25 - 8);
    lightColor = factor > 0.5 ? "#fef08a" : "#fbbf24";
    skyColor = "#38bdf8";
    horizonColor = "#fed7aa";
    fogColor = "#ffedd5";
    shadowColor = "#1e1b4b";
    lightIntensity = 0.85;
    shadowExaggeration = 0.7;
  } else if (elevation >= -2) {
    // Sunrise / Sunset / Twilight
    lightColor = "#f97316";
    skyColor = "#4338ca";
    horizonColor = "#f43f5e";
    fogColor = "#fda4af";
    shadowColor = "#0f172a";
    lightIntensity = 0.65;
    shadowExaggeration = 0.9;
  } else if (elevation >= -15) {
    // Dusk / Dawn Nautical Twilight
    lightColor = "#818cf8";
    skyColor = "#1e1b4b";
    horizonColor = "#312e81";
    fogColor = "#1e293b";
    shadowColor = "#020617";
    lightIntensity = 0.4;
    shadowExaggeration = 0.75;
  } else {
    // Deep Night / Moonlight
    lightColor = "#93c5fd";
    skyColor = "#020617";
    horizonColor = "#090d16";
    fogColor = "#020617";
    shadowColor = "#000000";
    lightIntensity = 0.25;
    shadowExaggeration = 0.4;
  }

  return {
    hour: normalizedHour,
    timeString: formatTime(normalizedHour),
    azimuth: Math.round(azimuth),
    elevation: Math.round(elevation),
    polarAngle: Math.round(polarAngle),
    lightIntensity,
    lightColor,
    skyColor,
    horizonColor,
    fogColor,
    shadowColor,
    shadowExaggeration,
    shadowEnabled,
    presetKey,
  };
}

export function getPresetState(
  presetKey: SolarPresetKey,
  shadowEnabled: boolean = true
): SolarState {
  const preset = SOLAR_PRESETS.find((p) => p.id === presetKey) || SOLAR_PRESETS[1];
  return calculateSolarState(preset.hour, shadowEnabled, presetKey);
}
