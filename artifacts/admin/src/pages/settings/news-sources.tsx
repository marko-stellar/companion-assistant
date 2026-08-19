/**
 * News Sources settings — manage the trusted outlets the companion may read
 * news from. Only enabled sources' domains are used by the server-side
 * allowlist when the companion retrieves current news.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Newspaper, Plus, Trash2, Pencil, X, Check } from "lucide-react";
import {
  useGetAdminNewsSources,
  useCreateAdminNewsSource,
  useUpdateAdminNewsSource,
  useDeleteAdminNewsSource,
  getGetAdminNewsSourcesQueryKey,
  type NewsSource,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormState {
  name: string;
  url: string;
  category: string;
  language: string;
}

const EMPTY_FORM: FormState = { name: "", url: "", category: "", language: "en" };

export function NewsSourcesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useGetAdminNewsSources();
  const sources = data?.sources ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetAdminNewsSourcesQueryKey() });

  const createMutation = useCreateAdminNewsSource({
    mutation: { onSuccess: () => { invalidate(); setShowForm(false); setForm(EMPTY_FORM); setFormError(null); } },
  });
  const updateMutation = useUpdateAdminNewsSource({
    mutation: { onSuccess: () => { invalidate(); setEditingId(null); setFormError(null); } },
  });
  const deleteMutation = useDeleteAdminNewsSource({
    mutation: { onSuccess: invalidate },
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const extractApiError = (err: unknown): string => {
    const maybe = err as { data?: { error?: string }; message?: string } | undefined;
    return maybe?.data?.error ?? maybe?.message ?? "Something went wrong. Please try again.";
  };

  const startEdit = (s: NewsSource) => {
    setEditingId(s.id);
    setShowForm(false);
    setFormError(null);
    setForm({ name: s.name, url: s.url ?? "", category: s.category ?? "", language: s.language });
  };

  const submitCreate = () => {
    if (!form.name.trim() || !form.url.trim()) {
      setFormError("Name and website URL are required.");
      return;
    }
    createMutation.mutate(
      { data: { name: form.name.trim(), url: form.url.trim(), category: form.category.trim() || undefined, language: form.language as "en" | "hr" } },
      { onError: (err) => setFormError(extractApiError(err)) },
    );
  };

  const submitEdit = () => {
    if (!editingId) return;
    if (!form.name.trim() || !form.url.trim()) {
      setFormError("Name and website URL are required.");
      return;
    }
    updateMutation.mutate(
      { id: editingId, data: { name: form.name.trim(), url: form.url.trim(), category: form.category.trim() || null, language: form.language as "en" | "hr" } },
      { onError: (err) => setFormError(extractApiError(err)) },
    );
  };

  const toggleEnabled = (s: NewsSource) => {
    updateMutation.mutate({ id: s.id, data: { isActive: !s.isActive } });
  };

  const remove = (s: NewsSource) => {
    if (window.confirm(`Delete "${s.name}"? The companion will no longer read news from this source.`)) {
      deleteMutation.mutate({ id: s.id });
    }
  };

  const formFields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="ns-name">Display name</Label>
        <Input id="ns-name" placeholder="e.g. BBC News" value={form.name}
          onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ns-url">Website URL</Label>
        <Input id="ns-url" placeholder="https://www.bbc.com" value={form.url}
          onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ns-category">Category (optional)</Label>
        <Input id="ns-category" placeholder="e.g. general, local, health" value={form.category}
          onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ns-language">Language</Label>
        <select
          id="ns-language"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={form.language}
          onChange={(e) => setForm(f => ({ ...f, language: e.target.value }))}
        >
          <option value="en">English</option>
          <option value="hr">Croatian</option>
        </select>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Newspaper className="h-6 w-6" /> News Sources
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              The companion only reads current news from the enabled sources below.
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); setFormError(null); }}>
              <Plus className="h-4 w-4 mr-1" /> Add source
            </Button>
          )}
        </div>

        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add trusted source</CardTitle>
              <CardDescription>Enter the outlet's main website — its domain becomes the allowlist entry.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {formFields}
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <div className="flex gap-2">
                <Button onClick={submitCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Adding…" : "Add source"}
                </Button>
                <Button variant="ghost" onClick={() => { setShowForm(false); setFormError(null); }}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading sources…</p>}
        {error != null && <p className="text-sm text-destructive">Failed to load news sources.</p>}

        {!isLoading && sources.length === 0 && !showForm && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No trusted sources yet. Until you add and enable at least one source, the companion
              will tell users honestly that it cannot read the news.
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {sources.map((s) =>
            editingId === s.id ? (
              <Card key={s.id}>
                <CardContent className="pt-6 space-y-4">
                  {formFields}
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={submitEdit} disabled={updateMutation.isPending}>
                      <Check className="h-4 w-4 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setFormError(null); }}>
                      <X className="h-4 w-4 mr-1" /> Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card key={s.id} className={s.isActive ? "" : "opacity-60"}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{s.name}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${s.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        {s.isActive ? "Enabled" : "Disabled"}
                      </span>
                      <span className="text-xs text-muted-foreground uppercase">{s.language}</span>
                      {s.category && <span className="text-xs text-muted-foreground">· {s.category}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{s.url}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-4">
                    <Button size="sm" variant="outline" onClick={() => toggleEnabled(s)} disabled={updateMutation.isPending}>
                      {s.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(s)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(s)} title="Delete"
                      disabled={deleteMutation.isPending}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
