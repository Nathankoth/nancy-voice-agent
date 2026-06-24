/** Canonical receipt shape — frontend and backend agree on this. */
export const SAMPLE_RECEIPT = {
  type: "booking",
  restaurant: { name: "Terra Kulture", area: "Victoria Island" },
  caller: { name: "Adaeze Okafor", phone: "+234 803 555 0192" },
  timestamp: new Date().toISOString(),
  booking: {
    date: "Friday, 27 June",
    time: "8:00 PM",
    partySize: 6,
    name: "Adaeze Okafor",
    notes: "Birthday dinner — window table if possible",
  },
  order: null,
  transcript: [
    { speaker: "nancy", text: "Good evening, thank you for calling Terra Kulture. This is Nancy. How may I help you?", t: 0 },
    { speaker: "caller", text: "Hi, I'd like to book a table for six this Friday.", t: 4 },
    { speaker: "nancy", text: "Of course. Friday the twenty-seventh at eight PM for six guests — may I have a name and phone number?", t: 9 },
    { speaker: "caller", text: "Adaeze Okafor. Zero eight zero three, five five five, zero one nine two.", t: 16 },
    { speaker: "nancy", text: "Perfect, Adaeze. Table for six, Friday at eight. Any special requests?", t: 24 },
    { speaker: "caller", text: "It's a birthday — window table if you have one.", t: 30 },
    { speaker: "nancy", text: "Noted. You're confirmed. We'll see you Friday at eight. Have a lovely evening.", t: 36 },
  ],
};

export const SAMPLE_ORDER_RECEIPT = {
  type: "order",
  restaurant: { name: "Nkoyo", area: "Lekki Phase 1" },
  caller: { name: "Tunde Bakare", phone: "+234 701 222 8844" },
  timestamp: new Date().toISOString(),
  booking: null,
  order: {
    items: [
      { name: "Party Jollof (large)", qty: 2, price: 8500, notes: "Extra pepper" },
      { name: "Suya platter", qty: 1, price: 12000, notes: "" },
      { name: "Chapman", qty: 3, price: 2500, notes: "" },
    ],
    total: 36000,
  },
  transcript: [
    { speaker: "nancy", text: "Nkoyo Lekki, this is Nancy. What would you like to order?", t: 0 },
    { speaker: "caller", text: "Two large party jollof, one suya platter, three chapmans.", t: 5 },
    { speaker: "nancy", text: "Got it. Name and number for pickup?", t: 11 },
    { speaker: "caller", text: "Tunde Bakare, zero seven zero one two two two eight eight four four.", t: 15 },
    { speaker: "nancy", text: "Total thirty-six thousand naira. Ready in forty-five minutes.", t: 22 },
  ],
};
