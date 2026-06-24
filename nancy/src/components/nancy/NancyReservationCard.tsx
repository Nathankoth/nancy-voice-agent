import type { Reservation } from "@/hooks/useNancyVoice";

interface NancyReservationCardProps {
  reservation: Reservation;
  compact?: boolean;
}

export default function NancyReservationCard({ reservation, compact }: NancyReservationCardProps) {
  const fields = [
    { label: "Guest", value: reservation.guest_name },
    { label: "Date", value: reservation.date },
    { label: "Time", value: reservation.time },
    {
      label: "Party",
      value: (reservation.party_size ?? reservation.guests)?.toString(),
    },
    { label: "Phone", value: reservation.phone },
  ].filter((f) => f.value);

  return (
    <div className={`nancy-reservation ${compact ? "nancy-reservation--compact" : ""}`}>
      <div className="nancy-reservation__badge">
        <span className="nancy-reservation__check">✓</span>
        Request recorded
      </div>
      <p className="nancy-reservation__note">
        A manager will contact you within 10 to 20 minutes to confirm.
      </p>
      <dl className="nancy-reservation__grid">
        {fields.map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
