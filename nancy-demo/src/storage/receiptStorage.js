const STORAGE_KEY = "nancy_receipts";

export function saveReceipt(id, receipt) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    all[id] = { ...receipt, id, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function loadReceipt(id) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return all[id] || null;
  } catch {
    return null;
  }
}

// Real API: POST /api/receipts → { id }, GET /api/receipts/:id
