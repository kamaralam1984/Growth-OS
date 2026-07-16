"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileIcon, Trash2, Download, Eye, EyeOff, History, ExternalLink } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { deleteProjectFile, updateProjectFileVisibility } from "../actions";
import { ProjectFileUploadForm } from "./project-file-upload-form";

export interface ProjectFileVersionDisplay {
  id: string;
  versionNumber: number;
  mimeType: string;
  sizeBytes: number;
  changeNote: string | null;
  createdAt: string;
  uploadedByName: string | null;
}

export interface ProjectFileDisplay {
  id: string;
  name: string;
  folder: string | null;
  visibleToClient: boolean;
  current: ProjectFileVersionDisplay | null;
  olderVersions: ProjectFileVersionDisplay[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

export function ProjectFileList({
  projectId,
  files,
  canManage,
}: {
  projectId: string;
  files: ProjectFileDisplay[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [lightbox, setLightbox] = useState<{ id: string; name: string } | null>(null);

  if (files.length === 0) {
    return (
      <Card glass>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <FileIcon className="size-8 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">No files yet. Upload the first deliverable.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {files.map((pf) => {
          const current = pf.current;
          const currentHref = current ? `/api/project-files/${current.id}` : null;
          const allVersions = current ? [current, ...pf.olderVersions] : [];

          return (
            <Card key={pf.id} glass>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  {current && currentHref && isImage(current.mimeType) ? (
                    <button
                      type="button"
                      onClick={() => setLightbox({ id: current.id, name: pf.name })}
                      className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10"
                      aria-label={`Preview ${pf.name}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={currentHref} alt="" className="size-full object-cover" />
                    </button>
                  ) : (
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileIcon className="size-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{pf.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {pf.folder ? `${pf.folder} · ` : ""}
                      {current
                        ? `v${current.versionNumber} · ${formatBytes(current.sizeBytes)}${current.uploadedByName ? ` · ${current.uploadedByName}` : ""} · ${new Date(current.createdAt).toLocaleDateString()}`
                        : "No versions yet"}
                    </p>
                  </div>
                  {pf.visibleToClient ? <Badge variant="accent">Client-visible</Badge> : <Badge variant="outline">Internal only</Badge>}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {current && currentHref && isPdf(current.mimeType) && (
                    <a
                      href={currentHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label="Preview PDF in a new tab"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}

                  {current && currentHref && (
                    <a
                      href={currentHref}
                      download={pf.name}
                      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label="Download"
                    >
                      <Download className="size-4" />
                    </a>
                  )}

                  {allVersions.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" aria-label="Version history">
                          <History className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-72">
                        <DropdownMenuLabel>Version history</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {allVersions.map((v) => (
                          <DropdownMenuItem key={v.id} asChild className="flex-col items-start gap-0.5">
                            <a href={`/api/project-files/${v.id}`} download={pf.name}>
                              <span className="flex w-full items-center justify-between gap-2 font-medium text-foreground">
                                <span>Version {v.versionNumber}</span>
                                {v.id === current?.id && <Badge variant="accent">Current</Badge>}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatBytes(v.sizeBytes)} · {v.uploadedByName ?? "Unknown"} · {new Date(v.createdAt).toLocaleDateString()}
                              </span>
                              {v.changeNote && <span className="text-xs italic text-muted-foreground">{v.changeNote}</span>}
                            </a>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  <ProjectFileUploadForm
                    projectId={projectId}
                    projectFileId={pf.id}
                    fileName={pf.name}
                    triggerLabel="New version"
                    triggerVariant="ghost"
                  />

                  {canManage && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          startTransition(async () => {
                            await updateProjectFileVisibility(pf.id, !pf.visibleToClient);
                            router.refresh();
                          })
                        }
                        aria-label={pf.visibleToClient ? "Hide from client" : "Show to client"}
                      >
                        {pf.visibleToClient ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          startTransition(async () => {
                            await deleteProjectFile(pf.id);
                            router.refresh();
                          })
                        }
                        aria-label="Delete"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">{lightbox?.name ?? "File preview"}</DialogTitle>
          {lightbox && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/project-files/${lightbox.id}`}
              alt={lightbox.name}
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
