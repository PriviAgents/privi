import { LiveGrid } from "./LiveGrid";

/**
 * Blueprint grid behind the whole site: hairline cells centred on the
 * viewport, a dot at each cell centre, faded at the edges. Still, except for
 * the cursor spotlight over the hero. The fully animated version is
 * <LiveGrid /> with its defaults.
 */
export function GridBackdrop() {
  return <LiveGrid className="grid-backdrop" ambient={false} hoverWithin="hero" />;
}
