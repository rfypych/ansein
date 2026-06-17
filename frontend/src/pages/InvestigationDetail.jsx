import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Play,
  Trash2,
  FileText,
  Upload,
  Network,
  Brain,
  MessageSquare,
  Download,
  Loader2,
  AlertCircle,
  Hash,
  Globe,
  Link as LinkIcon,
  Bug,
  Crosshair,
  MapPin,
  User,
  ShieldAlert,
  Wrench,
  Code,
  CreditCard,
} from "lucide-react";
import { http } from "../lib/api";
import {
  Card,
  CardHeader,
  Button,
  Badge,
  Input,
  Textarea,
  Spinner,
  EmptyState,
} from "../components/ui";
import { GraphView } from "../components/GraphView";
import { formatDate, severityColor, statusColor, truncate } from "../lib/utils";

const ENTITY_ICONS = {
  threat_actor: ShieldAlert,
  malware: Bug,
  tool: Wrench,
  technique: Code,
  vulnerability: ShieldAlert,
  ioc_ip: Globe,
  ioc_domain: LinkIcon,
  ioc_url: LinkIcon,
  ioc_hash: Hash,
  ioc_wallet: CreditCard,
  target: Crosshair,
  location: MapPin,
  identity: User,
};

const ENTITY_COLORS = {
  threat_actor: "red",
  malware: "violet",
  tool: "sky",
  technique: "sky",
  vulnerability: "amber",
  ioc_ip: "emerald",
  ioc_domain: "emerald",
  ioc_url: "violet",
  ioc_hash: "emerald",
  ioc_wallet: "amber",
  target: "amber",
  location: "slate",
  identity: "slate",
};

const TABS = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "sources", label: "Sources", icon: Upload },
  { id: "graph", label: "Graph", icon: Network },
  { id: "entities", label: "Entities", icon: Hash },
  { id: "analysis", label: "Analysis", icon: Brain },
  { id: "copilot", label: "Copilot", icon: MessageSquare },
];

export function InvestigationDetail() {
  const { id } = useParams();
  const invId = parseInt(id, 10);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [newSource, setNewSource] = useState({ title: "", content: "", source_type: "text" });

  const invQuery = useQuery({
    queryKey: ["investigation", invId],
    queryFn: () => http.get(`/investigations/${invId}`),
  });

  const sourcesQuery = useQuery({
    queryKey: ["sources", invId],
    queryFn: () => http.get(`/ingest/${invId}/sources`),
    enabled: !!invId,
  });

  const entitiesQuery = useQuery({
    queryKey: ["entities", invId],
    queryFn: () => http.get(`/entities/${invId}`),
    enabled: !!invId,
  });

  const graphQuery = useQuery({
    queryKey: ["graph", invId],
    queryFn: () => http.get(`/graph/${invId}`),
    enabled: !!invId && tab === "graph",
  });

  const analysisQuery = useQuery({
    queryKey: ["analysis", invId],
    queryFn: () => http.get(`/analysis/${invId}`).catch(() => null),
    enabled: !!invId && tab === "analysis",
  });

  const runPipeline = useMutation({
    mutationFn: () => http.post(`/investigations/${invId}/pipeline`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investigation", invId] });
      qc.invalidateQueries({ queryKey: ["entities", invId] });
      qc.invalidateQueries({ queryKey: ["graph", invId] });
      qc.invalidateQueries({ queryKey: ["analysis", invId] });
    },
  });

  const deleteInv = useMutation({
    mutationFn: () => http.delete(`/investigations/${invId}`),
    onSuccess: () => navigate("/app/investigations"),
  });

  const addSource = useMutation({
    mutationFn: (payload) => http.post(`/ingest/${invId}/sources`, payload),
    onSuccess: () => {
      setNewSource({ title: "", content: "", source_type: "text" });
      qc.invalidateQueries({ queryKey: ["sources", invId] });
      qc.invalidateQueries({ queryKey: ["investigation", invId] });
    },
  });

  const uploadFile = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name);
      return http.post(`/ingest/${invId}/sources/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources", invId] });
      qc.invalidateQueries({ queryKey: ["investigation", invId] });
    },
  });

  const inv = invQuery.data;

  if (invQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner className="w-6 h-6 text-sky-400" />
      </div>
    );
  }

  if (!inv) {
    return (
      <div className="p-8">
        <EmptyState
          icon={AlertCircle}
          title="Investigation not found"
          description="It may have been deleted, or you don't have access."
          action={
            <Link to="/app/investigations">
              <Button>Back to list</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-800 px-8 py-5">
        <button
          onClick={() => navigate("/app/investigations")}
          className="text-sm text-slate-500 hover:text-slate-300 mb-2 flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Investigations
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold truncate">{inv.title}</h1>
            {inv.description && (
              <p className="text-sm text-slate-500 mt-1 line-clamp-2">{inv.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge className={`border ${statusColor(inv.status)}`}>{inv.status}</Badge>
              <Badge className={`border ${severityColor(inv.severity_score)}`}>
                Severity: {inv.severity_score.toFixed(0)}/100
              </Badge>
              <Badge>
                {inv.entity_count} entities
              </Badge>
              <Badge>
                {inv.relationship_count} relationships
              </Badge>
              <span className="text-xs text-slate-500 ml-2">
                Updated {formatDate(inv.updated_at)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={() => runPipeline.mutate()}
              disabled={runPipeline.isPending || inv.status === "extracting" || inv.status === "enriching" || inv.status === "analyzing"}
            >
              {runPipeline.isPending || inv.status === "extracting" || inv.status === "enriching" || inv.status === "analyzing" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run pipeline
                </>
              )}
            </Button>
            <a href={`${http.baseUrl ? "" : "/api/v1"}/export/${invId}/pdf`} download>
              <Button variant="outline">
                <Download className="w-4 h-4" />
                PDF
              </Button>
            </a>
            <Button variant="ghost" onClick={() => deleteInv.mutate()} disabled={deleteInv.isPending}>
              <Trash2 className="w-4 h-4 text-red-400" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 px-8">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-sm border-b-2 transition-colors flex items-center gap-2 ${
                tab === t.id
                  ? "border-sky-500 text-sky-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        {tab === "overview" && (
          <div className="w-full space-y-6">
            <Card>
              <CardHeader title="Investigation details" />
              <div className="p-5 space-y-3">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Title</div>
                  <div className="text-sm">{inv.title}</div>
                </div>
                {inv.description && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Description</div>
                    <div className="text-sm text-slate-300">{inv.description}</div>
                  </div>
                )}
                {inv.tags?.length > 0 && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Tags</div>
                    <div className="flex flex-wrap gap-1.5">
                      {inv.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Created</div>
                    <div className="text-sm">{formatDate(inv.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Last updated</div>
                    <div className="text-sm">{formatDate(inv.updated_at)}</div>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Quick start"
                subtitle="Add a source (paste text, upload a file), then click Run pipeline."
              />
              <div className="p-5 text-sm text-slate-400 space-y-2">
                <p>
                  <span className="text-sky-400 font-semibold">1.</span> Go to the{" "}
                  <button onClick={() => setTab("sources")} className="text-sky-400 hover:text-sky-300">
                    Sources
                  </button>{" "}
                  tab and paste your threat intel text (a blog post, IOC list, threat report).
                </p>
                <p>
                  <span className="text-sky-400 font-semibold">2.</span> Click{" "}
                  <span className="text-sky-300">Run pipeline</span> in the top right. AnseIn will
                  extract IOCs, enrich them via VirusTotal/AbuseIPDB/Shodan, infer relationships,
                  and generate a cognitive analysis.
                </p>
                <p>
                  <span className="text-sky-400 font-semibold">3.</span> Review the{" "}
                  <button onClick={() => setTab("graph")} className="text-sky-400 hover:text-sky-300">
                    Graph
                  </button>{" "}
                  and{" "}
                  <button onClick={() => setTab("analysis")} className="text-sky-400 hover:text-sky-300">
                    Analysis
                  </button>{" "}
                  tabs, then ask the{" "}
                  <button onClick={() => setTab("copilot")} className="text-sky-400 hover:text-sky-300">
                    Copilot
                  </button>{" "}
                  questions about what you've found.
                </p>
              </div>
            </Card>
          </div>
        )}

        {tab === "sources" && (
          <div className="w-full space-y-6">
            <Card>
              <CardHeader title="Add new source" subtitle="Paste threat intel text, IOC lists, or upload a file" />
              <div className="p-5 space-y-3">
                <Input
                  placeholder="Source title (optional)"
                  value={newSource.title}
                  onChange={(e) => setNewSource((s) => ({ ...s, title: e.target.value }))}
                />
                <Textarea
                  rows={6}
                  placeholder="Paste raw threat intel text here — blog posts, IOC lists, incident notes, etc."
                  value={newSource.content}
                  onChange={(e) => setNewSource((s) => ({ ...s, content: e.target.value }))}
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => addSource.mutate(newSource)}
                    disabled={!newSource.content || addSource.isPending}
                  >
                    {addSource.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Adding…
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        Add text source
                      </>
                    )}
                  </Button>
                  <label className="cursor-pointer">
                    <Button variant="outline" type="button" onClick={() => document.getElementById("file-upload").click()}>
                      <Upload className="w-4 h-4" />
                      Upload file
                    </Button>
                    <input
                      id="file-upload"
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadFile.mutate(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={`Sources (${sourcesQuery.data?.length || 0})`} />
              <div className="p-5">
                {sourcesQuery.isLoading ? (
                  <div className="flex justify-center py-6">
                    <Spinner />
                  </div>
                ) : sourcesQuery.data?.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="No sources yet"
                    description="Add your first source above to begin extraction."
                  />
                ) : (
                  <div className="space-y-2">
                    {sourcesQuery.data?.map((s) => (
                      <div key={s.id} className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-800">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium">
                              {s.title || `Source #${s.id}`}
                            </div>
                            <div className="text-xs text-slate-500">
                              {s.source_type} • {s.size_bytes} bytes • {formatDate(s.created_at)}
                            </div>
                          </div>
                          <Badge>{s.mime_type}</Badge>
                        </div>
                        {s.content && (
                          <div className="text-xs text-slate-500 mt-2 line-clamp-3 font-mono">
                            {truncate(s.content, 300)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {tab === "graph" && (
          <Card className="h-[calc(100vh-340px)] min-h-[500px]">
            <CardHeader
              title="Knowledge graph"
              subtitle="Drag nodes to rearrange. Click a node for details."
            />
            <div className="h-[calc(100%-65px)]">
              {graphQuery.isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <Spinner />
                </div>
              ) : graphQuery.data?.nodes?.length === 0 ? (
                <EmptyState
                  icon={Network}
                  title="No entities to display"
                  description="Run the pipeline to extract entities and build the graph."
                />
              ) : (
                <GraphView data={graphQuery.data} onNodeClick={(n) => console.log(n)} />
              )}
            </div>
          </Card>
        )}

        {tab === "entities" && (
          <Card>
            <CardHeader title={`Entities (${entitiesQuery.data?.length || 0})`} />
            <div className="p-5">
              {entitiesQuery.isLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : entitiesQuery.data?.length === 0 ? (
                <EmptyState
                  icon={Hash}
                  title="No entities extracted yet"
                  description="Add sources and run the pipeline to extract entities."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {entitiesQuery.data?.map((e) => {
                    const Icon = ENTITY_ICONS[e.entity_type] || Hash;
                    const color = ENTITY_COLORS[e.entity_type] || "slate";
                    return (
                      <div
                        key={e.id}
                        className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-800 flex items-start gap-3"
                      >
                        <div className={`p-1.5 rounded bg-${color}-950/40 border border-${color}-900`}>
                          <Icon className={`w-4 h-4 text-${color}-400`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge color={color}>{e.entity_type}</Badge>
                            <span className="text-xs text-slate-500">via {e.source_method}</span>
                          </div>
                          <div className="text-sm font-mono mt-1 truncate" title={e.value}>
                            {e.value}
                          </div>
                          {e.enrichment && Object.keys(e.enrichment).length > 0 && (
                            <div className="text-xs text-slate-500 mt-1">
                              Enriched: {Object.keys(e.enrichment).join(", ")}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{(e.confidence * 100).toFixed(0)}%</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        )}

        {tab === "analysis" && (
          <div className="w-full">
            {analysisQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : !analysisQuery.data ? (
              <Card>
                <EmptyState
                  icon={Brain}
                  title="No analysis yet"
                  description="Run the pipeline to generate a threat narrative, severity score, and recommendations."
                />
              </Card>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader
                    title="Severity assessment"
                    action={
                      <Badge className={`border ${severityColor(analysisQuery.data.severity_score)}`}>
                        {analysisQuery.data.severity_score.toFixed(0)}/100
                      </Badge>
                    }
                  />
                  <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Admiralty code</div>
                      <div className="text-lg font-bold mt-1">{analysisQuery.data.admiralty_code}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Confidence</div>
                      <div className="text-lg font-bold mt-1">
                        {(analysisQuery.data.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Model</div>
                      <div className="text-sm font-mono mt-1">{analysisQuery.data.model_used}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Tokens used</div>
                      <div className="text-lg font-bold mt-1">{analysisQuery.data.tokens_used}</div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardHeader title="Threat narrative" />
                  <div className="p-5 prose-ansein">
                    {analysisQuery.data.narrative.split("\n").map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </Card>

                {analysisQuery.data.actor_hypothesis &&
                  Object.keys(analysisQuery.data.actor_hypothesis).length > 0 && (
                    <Card>
                      <CardHeader title="Actor hypothesis" />
                      <div className="p-5 space-y-2 text-sm">
                        <div>
                          <span className="text-slate-500">Likely actor:</span>{" "}
                          <span className="font-semibold">
                            {analysisQuery.data.actor_hypothesis.actor || "Unknown"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Confidence:</span>{" "}
                          {((analysisQuery.data.actor_hypothesis.confidence || 0) * 100).toFixed(0)}%
                        </div>
                        <div>
                          <span className="text-slate-500">Motivation:</span>{" "}
                          {analysisQuery.data.actor_hypothesis.motivation || "—"}
                        </div>
                        <div>
                          <span className="text-slate-500">Origin:</span>{" "}
                          {analysisQuery.data.actor_hypothesis.origin || "—"}
                        </div>
                        {analysisQuery.data.actor_hypothesis.reasoning && (
                          <div>
                            <span className="text-slate-500">Reasoning:</span>{" "}
                            {analysisQuery.data.actor_hypothesis.reasoning}
                          </div>
                        )}
                      </div>
                    </Card>
                  )}

                <Card>
                  <CardHeader title="Recommendations" />
                  <div className="p-5">
                    <ul className="space-y-2">
                      {analysisQuery.data.recommendations?.map((r, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-sky-400 mt-0.5">→</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {tab === "copilot" && <CopilotInline invId={invId} />}
      </div>
    </div>
  );
}

// Inline copilot embedded in the investigation view
function CopilotInline({ invId }) {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const newSession = async () => {
    try {
      const data = await http.post("/copilot/sessions", { investigation_id: invId });
      setSessionId(data.id);
      setMessages([]);
    } catch (e) {
      console.error(e);
    }
  };

  const send = async () => {
    if (!input.trim() || sending) return;
    if (!sessionId) {
      try {
        const data = await http.post("/copilot/sessions", { investigation_id: invId });
        setSessionId(data.id);
      } catch (e) {
        return;
      }
    }
    const userMsg = { role: "user", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);
    try {
      const resp = await http.post("/copilot/ask", {
        session_id: sessionId,
        investigation_id: invId,
        message: userMsg.content,
      });
      setMessages((m) => [...m, { role: "assistant", content: resp.message.content }]);
      if (!sessionId) setSessionId(resp.session_id);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${e.response?.data?.detail || e.message}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="h-[calc(100vh-340px)] min-h-[500px] flex flex-col">
      <CardHeader
        title="Investigation Copilot"
        subtitle="Ask questions grounded in this investigation's data"
        action={
          <Button variant="ghost" size="sm" onClick={newSession}>
            New chat
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-5 space-y-4">
        {messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Ask the Copilot"
            description="Try: 'Summarise the threat', 'What IOCs should I block?', 'Who is the likely actor?'"
          />
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-4 py-2 rounded-lg text-sm ${
                  m.role === "user"
                    ? "bg-sky-600 text-white"
                    : "bg-slate-800 text-slate-100"
                }`}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 text-sm flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Thinking…
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-slate-800 p-4 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask a question about this investigation…"
          disabled={sending}
        />
        <Button onClick={send} disabled={sending || !input.trim()}>
          Send
        </Button>
      </div>
    </Card>
  );
}
