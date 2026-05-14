import { clsx } from "clsx";

interface BrandWordmarkProps {
  className?: string;
}

export function BrandWordmark({ className }: BrandWordmarkProps) {
  return (
    <span
      className={clsx("cc-wordmark inline-flex items-baseline leading-none", className)}
      aria-label="Convive"
    >
      <span className="sr-only">CONVIVE</span>
      <span aria-hidden="true" className="inline-flex items-baseline leading-none">
        <span>CON</span>
        <svg
          viewBox="0 0 30 34"
          className="mx-[0.03em] h-[0.82em] w-[0.72em] translate-y-[0.06em]"
          fill="none"
        >
          <path
            d="M4 4L15 30L26 4"
            stroke="currentColor"
            strokeWidth="4.6"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </svg>
        <span>IVE</span>
      </span>
    </span>
  );
}
