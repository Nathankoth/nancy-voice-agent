import Link from "next/link";
import NancyShell from "@/components/nancy/NancyShell";
import NancyWidget from "@/components/nancy/NancyWidget";

const RESTAURANT = process.env.NEXT_PUBLIC_RESTAURANT_NAME || "XYZ Restaurant";
const RESTAURANT_SUB = process.env.NEXT_PUBLIC_RESTAURANT_SUB || "Voice receptionist";

export default function HomePage() {
  return (
    <NancyShell
      active="dashboard"
      footer={<p>Built for restaurants · Nancy captures calls in real time</p>}
    >
      <section className="nancy-hero">
        <div className="nancy-hero__copy">
          <div className="nancy-hero__orb" aria-hidden="true">
            <span />
          </div>
          <p className="nancy-hero__eyebrow">
            {RESTAURANT} · {RESTAURANT_SUB}
          </p>
          <h1 className="nancy-hero__title">
            The call gets answered.
            <br />
            <em>Every single time.</em>
          </h1>
          <p className="nancy-hero__lede">
            Nancy takes reservations the moment the phone rings, then hands you a clean
            receipt and schedules manager follow-up within ten to twenty minutes.
          </p>
          <div className="nancy-hero__features">
            <span className="nancy-hero__pill">Voice booking</span>
            <span className="nancy-hero__pill">Instant receipt</span>
            <span className="nancy-hero__pill">Manager confirms shortly</span>
          </div>
        </div>

        <div className="nancy-hero__card-wrap">
          <NancyWidget variant="full" restaurantName={RESTAURANT} />
        </div>
      </section>

      <section className="nancy-features">
        <div className="nancy-features__grid">
          <article className="nancy-feature">
            <div className="nancy-feature__icon">🎙️</div>
            <h3>Talk naturally</h3>
            <p>Name, party size, date, time, and special requests. Nancy captures it all.</p>
          </article>
          <article className="nancy-feature">
            <div className="nancy-feature__icon">🧾</div>
            <h3>Your receipt</h3>
            <p>After your call, see exactly what was recorded and what happens next.</p>
          </article>
          <article className="nancy-feature">
            <div className="nancy-feature__icon">📋</div>
            <h3>Owner view</h3>
            <p>
              Staff see every call as a receipt on the{" "}
              <Link href="/admin" className="nancy-inline-link">
                admin page
              </Link>
              , with summaries on tap.
            </p>
          </article>
        </div>
      </section>
    </NancyShell>
  );
}
