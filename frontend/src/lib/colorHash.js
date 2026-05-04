// Stable color assignment for tag/carrier chips
const PALETTE = [
  { bg: "bg-purple-500/20", text: "text-purple-300", border: "border-purple-500/30" },
  { bg: "bg-amber-500/20", text: "text-amber-300", border: "border-amber-500/30" },
  { bg: "bg-sky-500/20", text: "text-sky-300", border: "border-sky-500/30" },
  { bg: "bg-emerald-500/20", text: "text-emerald-300", border: "border-emerald-500/30" },
  { bg: "bg-rose-500/20", text: "text-rose-300", border: "border-rose-500/30" },
  { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/30" },
  { bg: "bg-pink-500/20", text: "text-pink-300", border: "border-pink-500/30" },
  { bg: "bg-teal-500/20", text: "text-teal-300", border: "border-teal-500/30" },
  { bg: "bg-orange-500/20", text: "text-orange-300", border: "border-orange-500/30" },
  { bg: "bg-indigo-500/20", text: "text-indigo-300", border: "border-indigo-500/30" },
  { bg: "bg-lime-500/20", text: "text-lime-300", border: "border-lime-500/30" },
  { bg: "bg-cyan-500/20", text: "text-cyan-300", border: "border-cyan-500/30" },
];

// Specific overrides for known carriers to match expected colors
const CARRIER_OVERRIDES = {
  helium: PALETTE[0],
  tello: PALETTE[1],
  tracfone: PALETTE[2],
  "us mobile": PALETTE[3],
  mint: PALETTE[3],
  verizon: PALETTE[4],
  "t-mobile": PALETTE[5],
  tmobile: PALETTE[5],
  att: PALETTE[7],
  "at&t": PALETTE[7],
};

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function colorForTag(tag) {
  if (!tag) return PALETTE[0];
  return PALETTE[hashString(tag.toLowerCase()) % PALETTE.length];
}

export function colorForCarrier(carrier) {
  if (!carrier) return PALETTE[6];
  const k = carrier.trim().toLowerCase();
  if (CARRIER_OVERRIDES[k]) return CARRIER_OVERRIDES[k];
  return PALETTE[hashString(k) % PALETTE.length];
}
