import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border border-[#17314f] bg-[linear-gradient(135deg,#10213c_0%,#17314f_48%,#1d5f7d_100%)] text-white shadow-[0_20px_44px_-24px_rgba(16,33,60,0.72)] hover:-translate-y-0.5 hover:brightness-[1.05] focus-visible:ring-[#1d5f7d]",
        secondary:
          "border border-white/70 bg-white/82 text-slate-900 shadow-[0_16px_36px_-26px_rgba(16,33,60,0.32)] hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white focus-visible:ring-slate-400",
        ghost:
          "text-slate-700 hover:bg-slate-100/80 focus-visible:ring-slate-400"
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-4",
        lg: "h-12 px-6"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
