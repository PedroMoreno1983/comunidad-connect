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
      Convive
    </span>
  );
}
