import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  FileText,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingCards } from "@/components/common/states";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/hooks/use-session";
import { friendlyError, logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/format";
import {
  createEducationSignedUrls,
  deleteEducationMaterial,
  EDUCATION_CATEGORIES,
  type EducationCategory,
  type EducationMaterial,
  type EducationMediaType,
  type EducationPresentation,
  searchEducationMaterials,
  updateEducationMaterial,
  uploadEducationBeforeAfterPair,
  uploadEducationMaterial,
} from "@/services/education-library";

export const Route = createFileRoute("/_authenticated/patient-education")({
  head: () => ({
    meta: [
      { title: "Patient Education — VSP Software" },
      {
        name: "description",
        content:
          "Browse and manage clinic education photos, videos and PDFs for patient explanations.",
      },
    ],
  }),
  component: PatientEducationPage,
});

const PAGE_SIZE = 48;

function categoryLabel(value: EducationCategory) {
  return EDUCATION_CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

function mediaIcon(type: EducationMediaType) {
  if (type === "video") return Video;
  if (type === "pdf") return FileText;
  return ImageIcon;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function PatientEducationPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<EducationCategory | "all">("all");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<EducationMaterial | null>(null);
  const [preview, setPreview] = useState<EducationMaterial | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EducationMaterial | null>(null);
  const [showAdvancedTags, setShowAdvancedTags] = useState(false);

  const [uploadMode, setUploadMode] = useState<"single" | "before_after">("single");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [formCategory, setFormCategory] = useState<EducationCategory>("dental_problem");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category]);

  const searching = debouncedSearch.trim().length > 0;

  const listQuery = useQuery({
    queryKey: [
      "education-materials",
      profile?.clinic_id,
      searching ? "" : debouncedSearch,
      category,
      searching ? 1 : page,
    ],
    enabled: !!profile?.clinic_id,
    queryFn: () =>
      searchEducationMaterials({
        query: "",
        category,
        mediaType: "all",
        presentation: "all",
        page: searching ? 1 : page,
        pageSize: searching ? 100 : PAGE_SIZE,
      }),
  });

  const materials = useMemo(() => {
    const rows = listQuery.data?.materials ?? [];
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((item) => {
      const haystack = [item.title, item.summary ?? "", item.originalFilename, ...item.tags]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [listQuery.data?.materials, debouncedSearch]);
  const total = searching ? materials.length : (listQuery.data?.total ?? 0);
  const totalPages = searching ? 1 : Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / PAGE_SIZE));

  const signedUrlsQuery = useQuery({
    queryKey: [
      "education-signed-urls",
      profile?.clinic_id,
      materials
        .map((item) => `${item.id}:${item.afterId ?? ""}`)
        .join(","),
    ],
    enabled: !!profile?.clinic_id && materials.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => createEducationSignedUrls(materials),
  });

  const signedUrls = useMemo(
    () => signedUrlsQuery.data ?? new Map<string, string>(),
    [signedUrlsQuery.data],
  );

  const previewUrl = useMemo(() => {
    if (!preview) return null;
    return signedUrls.get(preview.id) ?? null;
  }, [preview, signedUrls]);

  const previewAfterUrl = useMemo(() => {
    if (!preview?.afterId) return null;
    return signedUrls.get(preview.afterId) ?? null;
  }, [preview, signedUrls]);

  function resetForm() {
    setTitle("");
    setSummary("");
    setFormCategory("dental_problem");
    setTags("");
    setFile(null);
    setBeforeFile(null);
    setAfterFile(null);
    setUploadMode("single");
    setShowAdvancedTags(false);
    setEditing(null);
  }

  function openUpload() {
    resetForm();
    setUploadOpen(true);
  }

  function openEdit(material: EducationMaterial) {
    setEditing(material);
    setTitle(material.title);
    setSummary(material.summary ?? "");
    setFormCategory(material.category);
    setTags(material.tags.join(", "));
    setShowAdvancedTags(material.tags.length > 0);
    setUploadMode(material.presentation === "before_after" ? "before_after" : "single");
    setFile(null);
    setBeforeFile(null);
    setAfterFile(null);
    setUploadOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");
      const payload = {
        title,
        summary,
        category: formCategory,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      };

      if (editing) {
        await updateEducationMaterial(editing.id, payload, editing.pairGroupId);
        await logAudit(profile.clinic_id, "education_updated", "education_materials", editing.id, {
          title: payload.title,
        });
        return { mode: "edit" as const, duplicate: false };
      }

      if (uploadMode === "before_after") {
        if (!beforeFile || !afterFile) {
          throw new Error("Choose both a Before photo and an After photo.");
        }
        const result = await uploadEducationBeforeAfterPair(payload, beforeFile, afterFile);
        await logAudit(profile.clinic_id, "education_uploaded", "education_materials", result.id, {
          title: payload.title,
          presentation: "before_after",
          duplicate: result.duplicate,
        });
        return { mode: "upload" as const, duplicate: result.duplicate };
      }

      if (!file) throw new Error("Choose a photo, video or PDF to upload.");
      const result = await uploadEducationMaterial(payload, file);
      await logAudit(profile.clinic_id, "education_uploaded", "education_materials", result.id, {
        title: payload.title,
        duplicate: result.duplicate,
      });
      return { mode: "upload" as const, duplicate: result.duplicate };
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["education-materials"] });
      setUploadOpen(false);
      resetForm();
      if (result.mode === "edit") toast.success("Education material updated.");
      else if (result.duplicate) toast.message("This file already exists in your library.");
      else toast.success("Education material uploaded.");
    },
    onError: (error) => toast.error(friendlyError(error, "Unable to save education material.")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (material: EducationMaterial) => {
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");
      const result = await deleteEducationMaterial(material.id);
      await logAudit(profile.clinic_id, "education_deleted", "education_materials", material.id, {
        title: material.title,
        presentation: material.presentation,
      });
      return result;
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["education-materials"] });
      if (preview) setPreview(null);
      if (result.storageCleanupFailed) {
        toast.message("Material deleted. Storage cleanup can be retried later.");
      } else {
        toast.success("Education material deleted.");
      }
    },
    onError: (error) => toast.error(friendlyError(error, "Unable to delete material.")),
  });

  return (
    <AppShell>
      <PageHeader
        title="Patient Education"
        description="Photos, videos and PDFs for dental problems and treatments."
        action={
          <Button size="sm" className="gap-1.5" onClick={openUpload}>
            <Plus className="size-3.5" aria-hidden />
            Upload
          </Button>
        }
      />

      <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          value={category}
          onValueChange={(value) => setCategory(value as EducationCategory | "all")}
        >
          <SelectTrigger aria-label="Filter by category" className="w-full sm:w-52">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {EDUCATION_CATEGORIES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search"
          aria-label="Search education materials"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {listQuery.isError ? (
        <ErrorState
          description="We couldn't load the education library."
          onRetry={() => void listQuery.refetch()}
        />
      ) : null}
      {listQuery.isLoading ? <LoadingCards count={3} /> : null}

      {!listQuery.isLoading && !listQuery.isError && materials.length === 0 ? (
        <EmptyState
          title={searching ? "No matches" : "No education materials yet"}
          description={
            searching
              ? "No title, summary, or file name matches that search."
              : "Upload photos, videos, PDFs, or Before/After pairs to explain treatments."
          }
          action={
            searching ? undefined : (
              <Button size="sm" onClick={openUpload}>
                Upload first material
              </Button>
            )
          }
        />
      ) : null}

      {!listQuery.isLoading && materials.length > 0 ? (
        <>
          <div className="mb-3 text-xs text-muted-foreground">
            {total} material{total === 1 ? "" : "s"}
            {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {materials.map((material) => {
              const Icon = mediaIcon(material.mediaType);
              const url = signedUrls.get(material.id);
              const afterUrl = material.afterId ? signedUrls.get(material.afterId) : null;
              const isPair = material.presentation === "before_after";
              return (
                <div key={material.id} className="surface-card overflow-hidden">
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => setPreview(material)}
                  >
                    <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-surface-2">
                      {isPair ? (
                        <div className="grid h-full w-full grid-cols-2">
                          <div className="relative border-r border-white/80 bg-surface-2">
                            {url ? (
                              <img
                                src={url}
                                alt={`${material.title} before`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-wide text-ink-500">
                                Before
                              </div>
                            )}
                            <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                              Before
                            </span>
                          </div>
                          <div className="relative bg-surface-2">
                            {afterUrl ? (
                              <img
                                src={afterUrl}
                                alt={`${material.title} after`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-wide text-ink-500">
                                After
                              </div>
                            )}
                            <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                              After
                            </span>
                          </div>
                        </div>
                      ) : material.mediaType === "image" && url ? (
                        <img
                          src={url}
                          alt={material.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-ink-500">
                          <Icon className="size-8" aria-hidden />
                          <span className="text-xs uppercase tracking-wide">
                            {material.mediaType}
                          </span>
                        </div>
                      )}
                      {isPair ? (
                        <Badge className="absolute right-2 top-2 bg-slate-900/80 text-[10px] text-white hover:bg-slate-900/80">
                          Before / After
                        </Badge>
                      ) : null}
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-semibold">{material.title}</p>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {categoryLabel(material.category)}
                        </Badge>
                      </div>
                      {material.summary ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {material.summary}
                        </p>
                      ) : null}
                      <p className="text-[11px] text-muted-foreground">
                        {formatBytes(material.byteSize)} · {formatDate(material.createdAt)}
                      </p>
                    </div>
                  </button>
                  <div className="flex gap-2 border-t border-line px-3 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1"
                      onClick={() => openEdit(material)}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="flex-1 gap-1 text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => setDeleteTarget(material)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit material" : "Upload education material"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the title, summary, category or tags."
                : "Add a single file or a Before/After photo pair."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {!editing ? (
              <div className="space-y-1.5">
                <Label>Upload type</Label>
                <Select
                  value={uploadMode}
                  onValueChange={(value) => {
                    setUploadMode(value as "single" | "before_after");
                    setFile(null);
                    setBeforeFile(null);
                    setAfterFile(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single file</SelectItem>
                    <SelectItem value="before_after">Before / After photos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="education-title">Title</Label>
              <Input
                id="education-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="education-summary">Short summary</Label>
              <Textarea
                id="education-summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={formCategory}
                onValueChange={(value) => setFormCategory(value as EducationCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDUCATION_CATEGORIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!showAdvancedTags ? (
              <button
                type="button"
                className="text-xs text-ink-500 underline-offset-2 hover:underline"
                onClick={() => setShowAdvancedTags(true)}
              >
                Add optional tags
              </button>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="education-tags">Tags (optional)</Label>
                <Input
                  id="education-tags"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                />
              </div>
            )}

            {!editing && uploadMode === "single" ? (
              <div className="space-y-1.5">
                <Label htmlFor="education-file">File</Label>
                <Input
                  id="education-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Photos are compressed before upload (max ~1920px). PDFs up to 25 MB.
                  Videos up to 200 MB.
                </p>
              </div>
            ) : null}

            {!editing && uploadMode === "before_after" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="education-before">Before photo</Label>
                  <Input
                    id="education-before"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => setBeforeFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="education-after">After photo</Label>
                  <Input
                    id="education-after"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => setAfterFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground sm:col-span-2">
                  JPEG, PNG or WebP only. Photos are compressed before upload. Both share
                  the same title and category.
                </p>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setUploadOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {editing ? "Save changes" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle>{preview.title}</DialogTitle>
                <DialogDescription>
                  {categoryLabel(preview.category)}
                  {preview.presentation === "before_after"
                    ? " · Before / After"
                    : ` · ${formatBytes(preview.byteSize)}`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {preview.summary ? (
                  <p className="text-sm text-muted-foreground">{preview.summary}</p>
                ) : null}
                {preview.presentation === "before_after" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="overflow-hidden rounded-xl bg-surface-2">
                      <p className="px-3 py-2 text-xs font-medium text-ink-700">Before</p>
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={`${preview.title} before`}
                          className="max-h-[60vh] w-full object-contain"
                        />
                      ) : (
                        <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                          Preview unavailable
                        </div>
                      )}
                    </div>
                    <div className="overflow-hidden rounded-xl bg-surface-2">
                      <p className="px-3 py-2 text-xs font-medium text-ink-700">After</p>
                      {previewAfterUrl ? (
                        <img
                          src={previewAfterUrl}
                          alt={`${preview.title} after`}
                          className="max-h-[60vh] w-full object-contain"
                        />
                      ) : (
                        <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                          Preview unavailable
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl bg-surface-2">
                    {!previewUrl ? (
                      <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                        <BookOpen className="mr-2 size-4" aria-hidden />
                        Preview unavailable
                      </div>
                    ) : preview.mediaType === "image" ? (
                      <img
                        src={previewUrl}
                        alt={preview.title}
                        className="max-h-[70vh] w-full object-contain"
                      />
                    ) : preview.mediaType === "video" ? (
                      <video src={previewUrl} controls className="max-h-[70vh] w-full bg-black" />
                    ) : (
                      <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center">
                        <FileText className="size-10 text-ink-500" aria-hidden />
                        <p className="text-sm text-muted-foreground">
                          Open the PDF in a new tab for staff review.
                        </p>
                        <Button asChild size="sm">
                          <a href={previewUrl} target="_blank" rel="noreferrer">
                            Open PDF
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {preview.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {preview.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this material?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.presentation === "before_after"
                ? `Delete “${deleteTarget?.title}” (both Before and After)? This cannot be undone.`
                : `Delete “${deleteTarget?.title}”? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                deleteMutation.mutate(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
