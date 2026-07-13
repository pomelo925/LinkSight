import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const FILLED_VARIANTS = new Set(["default", "secondary", "destructive"]);

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground transition-colors duration-150 hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground transition-colors duration-150 hover:bg-destructive/90",
        outline:
          "gap-2 border border-input bg-transparent transition-colors hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground transition-colors duration-150 hover:bg-secondary/80",
        ghost:
          "gap-2 transition-colors hover:bg-accent hover:text-accent-foreground",
        link: "gap-2 text-primary underline-offset-4 transition-colors hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const labelHoverClass =
  "inline-flex items-center justify-center gap-2 transition-transform duration-150 group-hover:scale-105 group-active:scale-100";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const filled = FILLED_VARIANTS.has(variant ?? "default");
    const classes = cn(
      buttonVariants({ variant, size, className }),
      filled && "group",
    );

    const label = filled ? (
      <span className={labelHoverClass}>{children}</span>
    ) : (
      children
    );

    if (asChild && React.isValidElement(children)) {
      return (
        <Slot className={classes} ref={ref} {...props}>
          {React.cloneElement(
            children as React.ReactElement<{ children?: React.ReactNode }>,
            undefined,
            filled ? (
              <span className={labelHoverClass}>
                {(children as React.ReactElement<{ children?: React.ReactNode }>).props.children}
              </span>
            ) : (
              (children as React.ReactElement<{ children?: React.ReactNode }>).props.children
            ),
          )}
        </Slot>
      );
    }

    return (
      <button className={classes} ref={ref} {...props}>
        {label}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
