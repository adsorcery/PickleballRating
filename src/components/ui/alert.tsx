import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-xl border p-3 text-sm", {
  variants: {
    variant: {
      info: "border-border bg-muted text-foreground",
      success: "border-emerald-300 bg-emerald-50 text-emerald-950",
      warning: "border-amber-300 bg-amber-50 text-amber-950",
      destructive: "border-red-300 bg-red-50 text-red-950",
    },
  },
  defaultVariants: { variant: "info" },
});

export function Alert({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  const role = variant === "destructive" ? "alert" : "status";
  return <div role={role} className={cn(alertVariants({ variant }), className)} {...props} />;
}
