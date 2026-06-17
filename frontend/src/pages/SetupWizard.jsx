import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Database,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { http } from "../lib/api";
import { Button, Input, Card } from "../components/ui";

export function SetupWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0); // 0: status, 1: db, 2: admin, 3: done
  const [dbForm, setDbForm] = useState({
    database_url: "",
    secret_key: "",
  });
  const [adminForm, setAdminForm] = useState({
    email: "",
    password: "",
    full_name: "",
  });
  const [error, setError] = useState("");

  const status = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => http.get("/setup/status"),
    refetchOnMount: true,
  });

  // Auto-advance based on status
  if (status.data) {
    if (!status.data.setup_required) {
      navigate("/login");
    } else if (step === 0) {
      setStep(status.data.database_configured ? 2 : 1);
    }
  }

  const dbMutation = useMutation({
    mutationFn: (payload) => http.post("/setup/database", payload),
    onSuccess: (res) => {
      if (!res.success) {
        setError(res.message || "Database setup failed");
        return;
      }
      setError("");
      qc.invalidateQueries({ queryKey: ["setup-status"] });
      setStep(2);
    },
    onError: (err) => setError(err.response?.data?.message || "Database setup failed"),
  });

  const adminMutation = useMutation({
    mutationFn: (payload) => http.post("/setup/admin", payload),
    onSuccess: (res) => {
      if (!res.success) {
        setError(res.message || "Admin creation failed");
        return;
      }
      setError("");
      qc.invalidateQueries({ queryKey: ["setup-status"] });
      setStep(3);
      setTimeout(() => navigate("/login"), 1500);
    },
    onError: (err) => setError(err.response?.data?.message || "Admin creation failed"),
  });

  const presetDbUrl = (kind) => {
    const presets = {
      cpnel: "mysql+pymysql://USER:PASS@127.0.0.1:3306/DB?charset=utf8mb4",
      local: "mysql+pymysql://root:root@127.0.0.1:3306/ansein?charset=utf8mb4",
      sqlite: "sqlite:///./ansein.db",
    };
    setDbForm((f) => ({ ...f, database_url: presets[kind] || "" }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-lg bg-sky-500 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div className="text-center">
            <div className="font-bold text-xl">AnseIn Setup</div>
            <div className="text-xs text-slate-500">First-run configuration wizard</div>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border ${
                  step >= s
                    ? "bg-sky-600 border-sky-500 text-white"
                    : "bg-slate-900 border-slate-700 text-slate-500"
                }`}
              >
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className="w-12 h-px bg-slate-700" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-950/40 border border-red-900 text-sm text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {step === 1 && (
          <Card className="p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <Database className="w-5 h-5 text-sky-400" />
              <h2 className="text-lg font-semibold">Connect your database</h2>
            </div>
            <p className="text-sm text-slate-400 mb-5">
              AnseIn works with MySQL (recommended for cPanel hosting), PostgreSQL, or SQLite.
              Your connection string is stored locally in <code className="text-sky-300">.env</code> —
              never committed, never sent anywhere.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  DATABASE_URL
                </label>
                <Input
                  value={dbForm.database_url}
                  onChange={(e) => setDbForm((f) => ({ ...f, database_url: e.target.value }))}
                  placeholder="mysql+pymysql://user:pass@127.0.0.1:3306/dbname?charset=utf8mb4"
                  className="font-mono text-xs"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => presetDbUrl("cpnel")}
                    className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    cPanel MySQL template
                  </button>
                  <button
                    onClick={() => presetDbUrl("local")}
                    className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    Local MySQL template
                  </button>
                  <button
                    onClick={() => presetDbUrl("sqlite")}
                    className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    SQLite (dev only)
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Secret key <span className="text-slate-600">(optional — leave blank to keep current)</span>
                </label>
                <Input
                  value={dbForm.secret_key}
                  onChange={(e) => setDbForm((f) => ({ ...f, secret_key: e.target.value }))}
                  placeholder="auto-generated if blank"
                  className="font-mono text-xs"
                />
              </div>
              <Button
                onClick={() => dbMutation.mutate(dbForm)}
                disabled={dbMutation.isPending || !dbForm.database_url}
                className="w-full"
              >
                {dbMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  "Connect & migrate"
                )}
              </Button>
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card className="p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <UserPlus className="w-5 h-5 text-sky-400" />
              <h2 className="text-lg font-semibold">Create your admin account</h2>
            </div>
            <p className="text-sm text-slate-400 mb-5">
              This account has full administrative privileges. You can add additional analyst
              accounts (regular users) from the Settings page later.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Full name</label>
                <Input
                  value={adminForm.full_name}
                  onChange={(e) => setAdminForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="Admin analyst"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <Input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="admin@org.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Password <span className="text-slate-600">(min 8 chars)</span>
                </label>
                <Input
                  type="password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                />
              </div>
              <Button
                onClick={() => adminMutation.mutate(adminForm)}
                disabled={adminMutation.isPending || !adminForm.email || !adminForm.password}
                className="w-full"
              >
                {adminMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create admin account"
                )}
              </Button>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card className="p-8 text-center animate-fade-in">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Setup complete!</h2>
            <p className="text-sm text-slate-400 mb-6">
              Redirecting you to the login screen…
            </p>
            <Loader2 className="w-5 h-5 animate-spin text-sky-400 mx-auto" />
          </Card>
        )}
      </div>
    </div>
  );
}
