export function formatNaira(amount) {
  return `₦${Number(amount).toLocaleString("en-NG")}`;
}

export function formatReceiptTime(iso) {
  try {
    return new Intl.DateTimeFormat("en-NG", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Africa/Lagos",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function generateReceiptId() {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
