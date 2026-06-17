import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  FolderSearch,
  Activity,
  AlertTriangle,
  Bot,
  Plus,
  ArrowRight,
} from "lucide-react";
import { http } from "../lib/api";
import { Card, CardHeader, Button, Badge, Spinner, EmptyState } from "../components/ui";
import { formatDate, severityColor, statusColor } from "../lib/utils";

export function Dashboard() {
  const qc = useQueryClient();

  const { data: investigations, isLoading } = useQuery({
    queryKey: ["investigations", "dashboard"],
    queryFn: () => http.get("/investigations", { params: { page_size: 5 } }),
  });

  const { data: sessions } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => http.get("/copilot/sessions"),
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => http.get("/settings").catch(() => null),
  });

  const stats = investigations
    ? {
        total: investigations.total,
        completed: 0, // server doesn't filter this way for dashboard
        highSeverity: 0,
      }
    : null;

  const recent = investigations?.items || [];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Welcome back. Here's your threat intelligence overview.
          </p>
        </div>
        <Link to="/app/investigations/new">
          <Button>
            <Plus className="w-4 h-4" />
            New Investigation
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">Total investigations</div>
            <FolderSearch className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-3xl font-bold mt-2">{investigations?.total ?? "—"}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">Recent activity</div>
            <Activity className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-3xl font-bold mt-2">{recent.length}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">Copilot chats</div>
            <Bot className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-3xl font-bold mt-2">{sessions?.length ?? 0}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">API keys configured</div>
            <AlertTriangle className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-3xl font-bold mt-2">
            {settings
              ? [
                  settings.has_openai,
                  settings.has_groq,
                  settings.has_virustotal,
                  settings.has_abuseipdb,
                  settings.has_shodan,
                ].filter(Boolean).length
              : "—"}
            <span className="text-base text-slate-600">/5</span>
          </div>
        </Card>
      </div>

      {/* Recent investigations */}
      <Card>
        <CardHeader
          title="Recent investigations"
          subtitle="Your most recently updated cases"
          action={
            <Link to="/app/investigations" className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1">
              View all
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
        />
        <div className="p-5">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={FolderSearch}
              title="No investigations yet"
              description="Create your first investigation to start extracting threat intelligence."
              action={
                <Link to="/app/investigations/new">
                  <Button>
                    <Plus className="w-4 h-4" />
                    New Investigation
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {recent.map((inv) => (
                <Link
                  key={inv.id}
                  to={`/app/investigations/${inv.id}`}
                  className="block px-4 py-3 rounded-lg hover:bg-slate-800/50 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-100 group-hover:text-white truncate">
                        {inv.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
                        <span>{inv.entity_count} entities</span>
                        <span>•</span>
                        <span>{inv.relationship_count} relationships</span>
                        <span>•</span>
                        <span>{formatDate(inv.updated_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Badge className={`border ${statusColor(inv.status)}`}>{inv.status}</Badge>
                      <Badge className={`border ${severityColor(inv.severity_score)}`}>
                        {inv.severity_score.toFixed(0)}/100
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
