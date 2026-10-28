import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground",
      muted: "bg-muted text-foreground",
      warning: "bg-amber-100 text-amber-900",
      success: "bg-emerald-100 text-emerald-900",
      destructive: "bg-red-100 text-red-900",
      accent: "bg-accent text-accent-foreground",
    },
  },
  defaultVariants: { variant: "muted" },
});

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
