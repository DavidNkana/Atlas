import type { ReactNode } from "react";
import { BackgroundArt } from "./patterns/BackgroundArt";

/** Shared canvas for shell-bearing screens. Pattern art is opt-in so data-heavy
 * pages get the Atlas frame without turning the whole app into wallpaper. */
export function PageFrame({
  children,
  patterned = false,
}: {
  children: ReactNode;
  patterned?: boolean;
}) {
  return (
    <div className={`atlas-page-frame${patterned ? " atlas-page-frame--patterned" : ""}`}>
      {patterned && <BackgroundArt />}
      <div className="atlas-page-frame__content">{children}</div>
    </div>
  );
}
