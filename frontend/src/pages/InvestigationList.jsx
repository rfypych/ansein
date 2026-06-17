import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { FolderSearch, Plus, Search } from "lucide-react";
import { useState } from "react";
import { http } from "../lib/api";
import {
  Card,
  Button,
  Badge,
  Spinner,
  EmptyState,
  Input,
} from "../components/ui";
import { formatDate, severityColor, statusColor } from "../lib/utils";

export function InvestigationList() {
  const [search, setSearch] = useState("");
  const [params] = useSearchParams();
  const page = parseInt(params.get("page") || "1", 10);

  const { data, isLoading } = useQuery({
    queryKey: ["investigations", page],
    queryFn: () => http.get("/investigations", { params: { page, page_size: 20 } }),
  });

  const items = (data?.items || []).filter((i) =>
    !search ? true : i.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investigations</h1>
          <p className="text-sm text-slate-500 mt-1">
            All your threat intelligence cases, in one place.
          </p>
        </div>
        <Link to="/app/investigations/new">
          <Button>
            <Plus className="w-4 h-4" />
            New Investigation
          </Button>
        </Link>
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search by title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={FolderSearch}
            title={search ? "No matches" : "No investigations yet"}
            description={
              search
                ? "Try a different search term."
                : "Create your first investigation to get started."
            }
            action={
              !search && (
                <Link to="/app/investigations/new">
                  <Button>
                    <Plus className="w-4 h-4" />
                    New Investigation
                  </Button>
                </Link>
              )
            }
          />
        ) : (
          <div className="divide-y divide-slate-800">
            {items.map((inv) => (
              <Link
                key={inv.id}
                to={`/app/investigations/${inv.id}`}
                className="block px-5 py-4 hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-100">{inv.title}</div>
                    {inv.description && (
                      <div className="text-sm text-slate-500 mt-1 line-clamp-2">
                        {inv.description}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-2 flex items-center gap-3 flex-wrap">
                      <span>{inv.entity_count} entities</span>
                      <span>•</span>
                      <span>{inv.source_count} sources</span>
                      <span>•</span>
                      <span>{inv.relationship_count} relationships</span>
                      <span>•</span>
                      <span>Updated {formatDate(inv.updated_at)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
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
      </Card>
    </div>
  );
}
