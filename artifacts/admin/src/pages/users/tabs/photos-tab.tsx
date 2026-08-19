/**
 * PhotosTab — admin interface for managing a senior's photo gallery.
 *
 * Upload flow (two-step presigned):
 *   1. POST /api/admin/photos/upload-url          → presigned PUT URL
 *   2. Browser PUTs file bytes directly to GCS
 *   3. POST /api/admin/users/:userId/photos       → register metadata
 *
 * The companion can later reference photos via the show_photo tool.
 * Vision analysis runs asynchronously after registration.
 */

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  Trash2,
  Eye,
  RefreshCw,
  ImageIcon,
  MapPin,
  Calendar,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ── API helpers ───────────────────────────────────────────────────────────────

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error((j as { error?: string })?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface PhotoRecord {
  id: string;
  userId: string;
  objectKey: string;
  contentType: string | null;
  filename: string | null;
  title: string | null;
  approxDate: string | null;
  location: string | null;
  notes: string | null;
  visionDescription: string | null;
  sizeBytes: number | null;
  createdAt: string;
  signedUrl: string | null;
}

async function fetchPhotos(userId: string): Promise<PhotoRecord[]> {
  const data = await adminFetch<{ photos: PhotoRecord[] }>(`/api/admin/users/${userId}/photos`);
  return data.photos;
}

async function getUploadUrl(): Promise<{ uploadURL: string; objectPath: string }> {
  return adminFetch<{ uploadURL: string; objectPath: string }>("/api/admin/photos/upload-url", { method: "POST" });
}

async function registerPhoto(
  userId: string,
  body: {
    objectPath: string;
    contentType: string;
    filename: string;
    title?: string;
    approxDate?: string;
    location?: string;
    notes?: string;
    sizeBytes?: number;
  },
): Promise<{ photo: PhotoRecord }> {
  return adminFetch<{ photo: PhotoRecord }>(`/api/admin/users/${userId}/photos`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function deletePhoto(photoId: string): Promise<void> {
  await adminFetch(`/api/admin/photos/${photoId}`, { method: "DELETE" });
}

async function reanalyzePhoto(photoId: string): Promise<void> {
  await adminFetch(`/api/admin/photos/${photoId}/analyze`, { method: "POST" });
}

// ── Upload form ───────────────────────────────────────────────────────────────

interface UploadFormState {
  file: File | null;
  title: string;
  approxDate: string;
  location: string;
  notes: string;
}

const EMPTY_FORM: UploadFormState = {
  file: null,
  title: "",
  approxDate: "",
  location: "",
  notes: "",
};

const HEIC_FILENAME = /\.(heic|heif)$/i;

function isHeicFile(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || HEIC_FILENAME.test(file.name);
}

function isPhotoFile(file: File): boolean {
  return file.type.startsWith("image/") || isHeicFile(file);
}

function uploadContentType(file: File): string {
  if (file.type) return file.type;
  return isHeicFile(file) ? "image/heic" : "image/jpeg";
}

function UploadPanel({
  userId,
  onSuccess,
}: {
  userId: string;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<UploadFormState>(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && !isPhotoFile(f)) {
      setError("Please choose an image file.");
      return;
    }
    setForm(prev => ({ ...prev, file: f }));
    setDone(false);
    setError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && isPhotoFile(f)) {
      setForm(prev => ({ ...prev, file: f }));
      setDone(false);
      setError(null);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.file) { setError("Please choose an image file."); return; }

    setUploading(true);
    setError(null);
    setDone(false);

    try {
      const contentType = uploadContentType(form.file);

      // Step 1: get presigned PUT URL
      const { uploadURL, objectPath } = await getUploadUrl();

      // Step 2: PUT file directly to GCS
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: form.file,
      });
      if (!putRes.ok) throw new Error(`Upload to storage failed (${putRes.status})`);

      // Step 3: register metadata
      await registerPhoto(userId, {
        objectPath,
        contentType,
        filename: form.file.name,
        title: form.title.trim() || undefined,
        approxDate: form.approxDate.trim() || undefined,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
        sizeBytes: form.file.size,
      });

      setForm(EMPTY_FORM);
      if (fileRef.current) fileRef.current.value = "";
      setDone(true);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="border-dashed border-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4" /> Add New Photo
        </CardTitle>
        <CardDescription>
          Upload a photo for the companion to reference during conversations.
          Vision analysis runs automatically in the background.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Drop zone / file picker */}
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/5"
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="sr-only"
              onChange={handleFile}
            />
            {form.file ? (
              <div className="text-center">
                <ImageIcon className="h-8 w-8 mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium">{form.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(form.file.size / 1024).toFixed(0)} KB · {form.file.type}
                </p>
              </div>
            ) : (
              <>
                <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
                <div className="text-center">
                  <p className="text-sm font-medium">Drop an image here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPEG, PNG, WEBP, HEIC, HEIF — up to 20 MB
                  </p>
                  {form.file && isHeicFile(form.file) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      iPhone format detected — it will be converted to JPEG for display.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Metadata fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="title" className="text-xs">Title (optional)</Label>
              <Input
                id="title"
                placeholder="e.g. Family reunion 1988"
                value={form.title}
                onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="approxDate" className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Approximate date
              </Label>
              <Input
                id="approxDate"
                placeholder="e.g. Summer 1985 or 2003-06"
                value={form.approxDate}
                onChange={e => setForm(prev => ({ ...prev, approxDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="location" className="text-xs flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Location
              </Label>
              <Input
                id="location"
                placeholder="e.g. Split, Croatia"
                value={form.location}
                onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes" className="text-xs flex items-center gap-1">
              <FileText className="h-3 w-3" /> Admin notes (who is in the photo, context, etc.)
            </Label>
            <Textarea
              id="notes"
              placeholder="e.g. Left to right: daughter Petra, her husband Ivan, and the user's late wife Ana. Taken at their 40th wedding anniversary."
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">
              ⚠️ These notes are the <strong>only</strong> source the companion may use to identify people.
              The companion will never guess identities from faces alone.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 dark:text-green-400 dark:bg-green-900/20">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Photo uploaded. Vision analysis is running in the background.
            </div>
          )}

          <Button type="submit" disabled={uploading || !form.file} className="w-full">
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Upload Photo</>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Photo card ────────────────────────────────────────────────────────────────

function PhotoCard({
  photo,
  onDelete,
  onReanalyze,
}: {
  photo: PhotoRecord;
  onDelete: (id: string) => void;
  onReanalyze: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      <Card className="overflow-hidden">
        {/* Thumbnail */}
        <div
          className="relative bg-muted"
          style={{ aspectRatio: "4/3" }}
        >
          {photo.signedUrl ? (
            <img
              src={photo.signedUrl}
              alt={photo.title ?? "Photo"}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => setLightbox(true)}
              loading="lazy"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
          {photo.signedUrl && (
            <button
              onClick={() => setLightbox(true)}
              className="absolute top-2 right-2 rounded-full p-1.5 bg-black/40 text-white hover:bg-black/60 transition-colors"
              title="View full size"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <CardContent className="p-3 space-y-2">
          <div>
            <p className="font-medium text-sm truncate">{photo.title ?? "(untitled)"}</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {photo.approxDate && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" /> {photo.approxDate}
                </span>
              )}
              {photo.location && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {photo.location}
                </span>
              )}
            </div>
          </div>

          {/* Vision description */}
          {photo.visionDescription ? (
            <div
              className="text-xs rounded-lg p-2 cursor-pointer"
              style={{ background: "rgba(var(--primary-rgb, 59 130 246) / 0.06)", border: "1px solid rgba(var(--primary-rgb, 59 130 246) / 0.12)" }}
              onClick={() => setExpanded(!expanded)}
            >
              <p className="text-muted-foreground font-medium mb-0.5">Vision description</p>
              <p className={`text-foreground/80 ${expanded ? "" : "line-clamp-2"}`}>
                {photo.visionDescription}
              </p>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground rounded-lg p-2 bg-muted">
              <Loader2 className="h-3 w-3 inline mr-1 animate-spin" />
              Vision analysis pending…
            </div>
          )}

          {/* Admin notes */}
          {photo.notes && (
            <div className="text-xs rounded-lg p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/50">
              <p className="font-medium text-amber-800 dark:text-amber-400 mb-0.5">Admin notes</p>
              <p className="text-amber-900/70 dark:text-amber-300/70">{photo.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={() => onReanalyze(photo.id)}
              title="Re-run vision analysis"
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Re-analyze
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(photo.id)}
              title="Delete photo"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Simple lightbox */}
      {lightbox && photo.signedUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightbox(false)}
        >
          <img
            src={photo.signedUrl}
            alt={photo.title ?? "Photo"}
            className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function PhotosTab({ userId }: { userId: string }) {
  const qc = useQueryClient();

  const { data: photos = [], isLoading } = useQuery<PhotoRecord[]>({
    queryKey: ["admin-photos", userId],
    queryFn: () => fetchPhotos(userId),
    refetchInterval: 30_000, // poll for vision description updates
  });

  const deleteMut = useMutation({
    mutationFn: (photoId: string) => deletePhoto(photoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-photos", userId] }),
  });

  const reanalyzeMut = useMutation({
    mutationFn: (photoId: string) => reanalyzePhoto(photoId),
    onSuccess: () => {
      // Poll more aggressively after triggering analysis
      setTimeout(() => qc.invalidateQueries({ queryKey: ["admin-photos", userId] }), 5000);
    },
  });

  const handleRefresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-photos", userId] });
  };

  return (
    <div className="space-y-6">
      {/* Upload section */}
      <UploadPanel
        userId={userId}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["admin-photos", userId] })}
      />

      {/* Gallery */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">
            {photos.length > 0 ? `${photos.length} Photo${photos.length !== 1 ? "s" : ""}` : "No photos yet"}
          </h3>
          {photos.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              All photos are available to the companion via the show_photo tool.
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="bg-muted animate-pulse" style={{ aspectRatio: "4/3" }} />
              <CardContent className="p-3 space-y-2">
                <div className="h-3 bg-muted animate-pulse rounded w-3/4" />
                <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : photos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm font-medium text-muted-foreground">No photos uploaded yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Upload photos using the form above. The companion can display them during conversation
              and will help the senior reminisce.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map(photo => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              onDelete={id => deleteMut.mutate(id)}
              onReanalyze={id => reanalyzeMut.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
