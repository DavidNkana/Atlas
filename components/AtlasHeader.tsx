import Link from "next/link";
import { AtlasLogo } from "./AtlasLogo";

/** The single source of truth for Atlas's public shell navigation. */
export function AtlasHeader() {
  return (
    <header className="atlas-header">
      <Link href="/" className="atlas-header__brand" aria-label="Atlas home">
        <AtlasLogo size={30} />
        <span>Atlas</span>
      </Link>
      <nav className="atlas-header__nav" aria-label="Primary navigation">
        <Link href="/dashboard">See all</Link>
        <Link href="/demo">Demo</Link>
        <Link href="/news">News</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/investors">Investors</Link>
        <Link href="/calculator" className="atlas-header__cta">Calculator</Link>
      </nav>
    </header>
  );
}
