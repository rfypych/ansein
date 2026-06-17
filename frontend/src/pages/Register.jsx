import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, Mail, Lock, User } from "lucide-react";
import { http } from "../lib/api";
import { useAuthStore } from "../contexts/AuthContext";
import { Button, Input, Card } from "../components/ui";

export function Register() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const data = await http.post("/auth/register", form);
      login(data, data.user);
      navigate("/app");
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-sky-500 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold">AnseIn</div>
            <div className="text-xs text-slate-500">Threat Intelligence Platform</div>
          </div>
        </div>

        <h1 className="text-xl font-semibold mb-1">Create your account</h1>
        <p className="text-sm text-slate-500 mb-6">
          The first user on this instance becomes the administrator.
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Full name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                required
                value={form.full_name}
                onChange={set("full_name")}
                placeholder="Analyst name"
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                type="email"
                required
                value={form.email}
                onChange={set("email")}
                placeholder="you@org.com"
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Password <span className="text-slate-600">(min 8 chars)</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={set("password")}
                placeholder="••••••••"
                className="pl-9"
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <div className="mt-6 text-sm text-slate-500 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-sky-400 hover:text-sky-300">
            Log in
          </Link>
        </div>
      </Card>
    </div>
  );
}
