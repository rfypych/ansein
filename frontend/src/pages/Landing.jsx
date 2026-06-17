import { Link } from "react-router-dom";
import { ShieldCheck, Brain, Network, Bot, FileSearch, Download } from "lucide-react";

const features = [
  {
    icon: FileSearch,
    title: "Smart Extraction",
    desc: "Hybrid Regex → GLiNER → LLM pipeline pulls IOCs, actors, malware, vulns from any raw source.",
  },
  {
    icon: Network,
    title: "Knowledge Graph",
    desc: "Interactive D3 visualisation of entities and their relationships, with enrichment overlays.",
  },
  {
    icon: Brain,
    title: "Cognitive Analysis",
    desc: "LLM-generated threat narratives, actor hypotheses, severity scoring 0–100, and actionable recommendations.",
  },
  {
    icon: Bot,
    title: "Investigation Copilot",
    desc: "RAG-style chat with conversation memory, grounded strictly in your investigation's data.",
  },
  {
    icon: Download,
    title: "STIX 2.1 Export",
    desc: "One-click export to STIX 2.1, raw JSON, or a polished PDF report — fits any sharing workflow.",
  },
  {
    icon: ShieldCheck,
    title: "Multi-Tenant SaaS",
    desc: "BYOK architecture: each user supplies their own LLM & enrichment API keys, encrypted at rest.",
  },
];

export function Landing() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">AnseIn</span>
            <span className="text-xs text-slate-500 ml-2 hidden sm:inline">
              Advanced Neural Security Extractor Intelligence
            </span>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/login" className="text-slate-400 hover:text-white transition-colors">
              Log in
            </Link>
            <Link
              to="/register"
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 transition-colors font-medium"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-700 bg-slate-900/50 text-xs text-slate-400 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          v3.0 — Modular architecture, MySQL-ready, plug-and-play setup
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
          Turn raw threat data<br />into <span className="text-sky-400">decisions</span>.
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
          AnseIn is a CTI/OSINT platform that extracts, enriches, and visualises threat
          intelligence — then writes the report for you. Built for analysts who refuse to
          copy-paste IOCs into spreadsheets.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/register"
            className="px-6 py-3 rounded-lg bg-sky-600 hover:bg-sky-500 transition-colors font-semibold inline-flex items-center gap-2"
          >
            Start investigating
            <span className="text-sky-300">→</span>
          </Link>
          <Link
            to="/login"
            className="px-6 py-3 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors font-medium"
          >
            Log in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="p-6 rounded-xl border border-slate-800 bg-slate-900/50 hover:border-slate-700 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-sky-950/50 border border-sky-900 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-sky-400" />
              </div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-6xl mx-auto px-6 text-sm text-slate-500 flex flex-col md:flex-row items-center justify-between gap-3">
          <div>© 2026 AnseIn. Open-source CTI/OSINT platform.</div>
          <div className="flex items-center gap-4">
            <span className="text-slate-600">Built with FastAPI + React 19 + MySQL</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
