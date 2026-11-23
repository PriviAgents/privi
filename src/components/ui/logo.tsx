import Image from "next/image";
import Link from "next/link";
import { cx } from "./glass";

/**
 * Privi mark — the interwoven shield (public/brand/privi-mark.png, transparent).
 * `inverted` renders it white for dark surfaces.
 */
export function PriviMark({
  size = 28,
  className,
  inverted = false,
}: {
  size?: number;
  className?: string;
  inverted?: boolean;
}) {
  return (
    <Image
      src="/brand/privi-mark.png"
      alt=""
      width={size}
      height={size}
      priority={size >= 40}
      aria-hidden
      className={cx("select-none", inverted && "invert", className)}
      draggable={false}
    />
  );
}

export function Logo({
  href = "/",
  className,
  withText = true,
}: {
  href?: string;
  className?: string;
  withText?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx("inline-flex items-center gap-2 text-foreground", className)}
      aria-label="Privi home"
    >
      <PriviMark size={30} />
      {withText && (
        <span className="text-[17px] font-semibold tracking-tight">privi</span>
      )}
    </Link>
  );
}
