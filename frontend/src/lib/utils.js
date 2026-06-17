export function clsx(...args) {
  return args.flat(Infinity).filter(Boolean).join(" ");
}

export function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function severityColor(score) {
  if (score >= 70) return "text-red-400 bg-red-950/40 border-red-900";
  if (score >= 40) return "text-amber-400 bg-amber-950/40 border-amber-900";
  return "text-emerald-400 bg-emerald-950/40 border-emerald-900";
}

export function statusColor(status) {
  const map = {
    pending: "text-slate-400 bg-slate-900/40 border-slate-700",
    extracting: "text-sky-400 bg-sky-950/40 border-sky-900",
    enriching: "text-indigo-400 bg-indigo-950/40 border-indigo-900",
    analyzing: "text-violet-400 bg-violet-950/40 border-violet-900",
    completed: "text-emerald-400 bg-emerald-950/40 border-emerald-900",
    failed: "text-red-400 bg-red-950/40 border-red-900",
  };
  return map[status] || map.pending;
}

export function truncate(s, n = 80) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
