import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Key,
  Eye,
  EyeOff,
  Check,
  Loader2,
  Save,
  Brain,
  Globe,
  ShieldAlert,
} from "lucide-react";
import { http } from "../lib/api";
import { Card, CardHeader, Button, Input, Badge, Spinner } from "../components/ui";

const PROVIDERS = [
  {
    key: "groq_api_key",
    label: "Groq API Key",
    icon: Brain,
    desc: "LLM provider — recommended for fast, free inference (llama-3.3-70b).",
    placeholder: "gsk_…",
    link: "https://console.groq.com/keys",
  },
  {
    key: "openai_api_key",
    label: "OpenAI API Key",
    icon: Brain,
    desc: "Alternative LLM provider (gpt-4o-mini).",
    placeholder: "sk-…",
    link: "https://platform.openai.com/api-keys",
  },
  {
    key: "virustotal_api_key",
    label: "VirusTotal API Key",
    icon: ShieldAlert,
    desc: "File, URL, IP, and domain reputation.",
    placeholder: "…",
    link: "https://www.virustotal.com/gui/my-apikey",
  },
  {
    key: "abuseipdb_api_key",
    label: "AbuseIPDB API Key",
    icon: Globe,
    desc: "IP abuse reputation scores.",
    placeholder: "…",
    link: "https://www.abuseipdb.com/account/api",
  },
  {
    key: "shodan_api_key",
    label: "Shodan API Key",
    icon: Globe,
    desc: "Internet-exposed services & vulnerabilities.",
    placeholder: "…",
    link: "https://account.shodan.io/",
  },
];

export function Settings() {
  const qc = useQueryClient();
  const [values, setValues] = useState({});
  const [visible, setVisible] = useState({});
  const [savedKey, setSavedKey] = useState(null);

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => http.get("/settings"),
  });

  // Initialise values from server (we only know "has_*", not actual values — by design)
  const update = useMutation({
    mutationFn: (payload) => http.put("/settings", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSavedKey("all");
      setTimeout(() => setSavedKey(null), 1500);
    },
  });

  const handleSave = (key) => {
    const payload = { [key]: values[key] || "" };
    update.mutate(payload);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your API keys. Keys are encrypted at rest with Fernet (AES-128) using the
          app's SECRET_KEY, and never logged or sent to third parties.
        </p>
      </div>

      {/* Account */}
      <Card className="mb-6">
        <CardHeader title="Account" subtitle="Your user information" />
        <div className="p-5">
          {settings.isLoading ? (
            <Spinner />
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500 mb-1">Preferred LLM</div>
                <Badge>{settings.data?.preferred_llm || "auto"}</Badge>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Last updated</div>
                <div>{new Date(settings.data?.updated_at).toLocaleString()}</div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* API Keys */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Key className="w-5 h-5 text-sky-400" />
          API Keys (BYOK)
        </h2>

        {PROVIDERS.map((p) => {
          const hasKey = settings.data?.[`has_${p.key.replace("_api_key", "")}`];
          return (
            <Card key={p.key}>
              <CardHeader
                title={
                  <div className="flex items-center gap-2">
                    <p.icon className="w-4 h-4 text-slate-500" />
                    {p.label}
                    {hasKey ? (
                      <Badge color="emerald">
                        <Check className="w-3 h-3" /> Configured
                      </Badge>
                    ) : (
                      <Badge color="amber">Not set</Badge>
                    )}
                  </div>
                }
                subtitle={p.desc}
                action={
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-sky-400 hover:text-sky-300"
                  >
                    Get key →
                  </a>
                }
              />
              <div className="p-5">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={visible[p.key] ? "text" : "password"}
                      placeholder={hasKey ? "•••••••• (enter new value to replace)" : p.placeholder}
                      value={values[p.key] || ""}
                      onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
                      className="pr-10 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setVisible((v) => ({ ...v, [p.key]: !v[p.key] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {visible[p.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button
                    onClick={() => handleSave(p.key)}
                    disabled={update.isPending || (!values[p.key] && !hasKey)}
                  >
                    {update.isPending && savedKey !== "all" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {savedKey === "all" && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4" />
          Settings saved
        </div>
      )}
    </div>
  );
}
