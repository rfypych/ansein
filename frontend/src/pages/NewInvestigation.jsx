import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Tag } from "lucide-react";
import { http } from "../lib/api";
import { Card, CardHeader, Button, Input, Textarea } from "../components/ui";

export function NewInvestigation() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", description: "", tags: [] });
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !form.tags.includes(t)) {
      setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    }
    setTagInput("");
  };

  const removeTag = (t) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await http.post("/investigations", form);
      navigate(`/app/investigations/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create investigation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <button
        onClick={() => navigate("/app/investigations")}
        className="text-sm text-slate-500 hover:text-slate-300 mb-4 flex items-center gap-1"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to investigations
      </button>

      <h1 className="text-2xl font-bold mb-1">New investigation</h1>
      <p className="text-sm text-slate-500 mb-6">
        Create a case, then add sources (text, files, URLs) to begin extraction.
      </p>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900 text-sm text-red-300">
          {error}
        </div>
      )}

      <Card>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Title *</label>
            <Input
              required
              value={form.title}
              onChange={set("title")}
              placeholder="e.g. APT29 spear-phishing campaign — Q2 2026"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
            <Textarea
              rows={4}
              value={form.description}
              onChange={set("description")}
              placeholder="Brief context for this investigation — what triggered it, scope, etc."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Tags</label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add a tag and press Enter"
              />
              <Button type="button" variant="secondary" onClick={addTag}>
                Add
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => removeTag(t)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    <Tag className="w-3 h-3" />
                    {t}
                    <span className="text-slate-500 ml-1">×</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate("/app/investigations")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create investigation"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
