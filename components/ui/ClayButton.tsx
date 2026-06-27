import { forwardRef } from "react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

type Variant = "primary" | "accent" | "outline" | "whatsapp";
type Size = "md" | "lg";

// Green + white text, dark green edge (verified 7.7:1)
const PRIMARY = "btn-clay bg-brand text-canvas [--edge:var(--brand-edge)]";

const variantClasses: Record<Variant, string> = {
  primary: PRIMARY,
  // Orange + DARK ink text only (white fails on orange), darker orange edge
  accent: "btn-clay bg-orange text-ink [--edge:var(--orange-edge)]",
  // White surface, brand text, 2px brand border — no heavy edge
  outline:
    "bg-surface text-brand border-2 border-brand shadow-clay-sm hover:bg-canvas-sunk transition-colors",
  // WhatsApp CTA stays in brand green for cohesion — same look as primary.
  whatsapp: PRIMARY,
};

const sizeClasses: Record<Size, string> = {
  md: "min-h-[3rem] px-6 text-base",
  lg: "min-h-[3.5rem] px-7 text-lg",
};

const baseClasses =
  "inline-flex items-center justify-center gap-2.5 rounded-clay font-display font-semibold leading-none " +
  "cursor-pointer select-none text-center disabled:opacity-50 disabled:cursor-not-allowed " +
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/45 [touch-action:manipulation]";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
}

type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

// Full anchor attribute set, so any prop passed to a link-style ClayButton
// (target, rel, download, data-*, onMouseEnter…) is forwarded onto the <a>.
type AnchorProps = CommonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export const ClayButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps | AnchorProps
>(function ClayButton(props, ref) {
  const { variant = "primary", size = "md", className = "" } = props;
  const cls = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  if ("href" in props && props.href !== undefined) {
    const { variant: _v, size: _s, className: _c, children, ...rest } =
      props as AnchorProps;
    return (
      <a ref={ref as React.Ref<HTMLAnchorElement>} className={cls} {...rest}>
        {children}
      </a>
    );
  }

  const { variant: _v, size: _s, className: _c, children, ...rest } =
    props as ButtonProps;
  return (
    <button ref={ref as React.Ref<HTMLButtonElement>} className={cls} {...rest}>
      {children}
    </button>
  );
});
