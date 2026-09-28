interface GeoMozMarkProps {
  size?: number;
  className?: string;
}

export default function GeoMozMark({
  size = 32,
  className = "",
}: GeoMozMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect width="48" height="48" rx="12" fill="#07111F" />
      <circle cx="24" cy="24" r="14.5" stroke="#00B8D9" strokeWidth="2.2" />
      <path
        d="M10.5 24H37.5M24 9.5C28.2 13.2 30.4 18.1 30.4 24C30.4 29.9 28.2 34.8 24 38.5M24 9.5C19.8 13.2 17.6 18.1 17.6 24C17.6 29.9 19.8 34.8 24 38.5"
        stroke="#00B8D9"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.72"
      />
      <path
        d="M13.2 17.5C16.1 19 19.8 19.8 24 19.8C28.2 19.8 31.9 19 34.8 17.5M13.2 30.5C16.1 29 19.8 28.2 24 28.2C28.2 28.2 31.9 29 34.8 30.5"
        stroke="#00B8D9"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M31.7 13.7L27.7 19.9L33.6 18.1L31.7 13.7Z"
        fill="#18D6A5"
        stroke="#07111F"
        strokeWidth="0.7"
      />
      <circle cx="31.5" cy="18.2" r="2.2" fill="#18D6A5" />
      <circle cx="31.5" cy="18.2" r="0.85" fill="#07111F" />
    </svg>
  );
}
