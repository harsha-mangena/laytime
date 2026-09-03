import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] leading-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-foreground",
        outline: "border-border text-muted-foreground",
        void: "border-destructive/40 bg-destructive/10 text-destructive",
        ok: "border-ok/40 bg-ok/15 text-ok",
        warn: "border-warn/40 bg-warn/12 text-warn",
        steel: "border-steel/30 bg-steel/10 text-steel",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
