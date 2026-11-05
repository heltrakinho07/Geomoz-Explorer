import type { ImgHTMLAttributes } from "react";

/**
 * Canonical GeoMoz identity mark.
 * The GIS Workspace copies this exact SVG from /public/favicon.svg when built.
 * The icon is shared by the website, Explorer, legal pages and install prompts.
 */
export const GEOMOZ_BRAND_ICON = "/favicon.svg";

type GeoMozBrandIconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src">;

export default function GeoMozBrandIcon({
  className = "",
  alt = "",
  width = 40,
  height = 40,
  ...props
}: GeoMozBrandIconProps) {
  return (
    <img
      src={GEOMOZ_BRAND_ICON}
      alt={alt}
      width={width}
      height={height}
      decoding="async"
      className={`block shrink-0 object-contain ${className}`}
      {...props}
    />
  );
}
