import Link from "next/link";

interface NancyNavProps {
  active?: "dashboard" | "admin";
}

export default function NancyNav({ active }: NancyNavProps) {
  return (
    <nav className="nancy-nav">
      <Link href="/" className="nancy-nav__brand">
        Nancy
      </Link>
      <div className="nancy-nav__links">
        <Link href="/" className={active === "dashboard" ? "nancy-nav__active" : undefined}>
          Dashboard
        </Link>
        <Link href="/admin" className={active === "admin" ? "nancy-nav__active" : undefined}>
          Admin
        </Link>
      </div>
    </nav>
  );
}
