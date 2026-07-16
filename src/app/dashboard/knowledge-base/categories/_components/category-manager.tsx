"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { createCategory, updateCategory, deleteCategory } from "../actions";

export interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  articleCount: number;
}

export interface CategoryManagerProps {
  categories: CategoryRow[];
  canManage: boolean;
}

interface FormState {
  name: string;
  description: string;
  parentId: string;
}

const EMPTY_FORM: FormState = { name: "", description: "", parentId: "" };

/** Flattens the parent/child tree into a depth-annotated, parent-first ordering for simple indented display. */
function flattenTree(categories: CategoryRow[]): Array<CategoryRow & { depth: number }> {
  const byParent = new Map<string | null, CategoryRow[]>();
  for (const c of categories) {
    const key = c.parentId;
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }

  const result: Array<CategoryRow & { depth: number }> = [];
  function walk(parentId: string | null, depth: number) {
    for (const c of byParent.get(parentId) ?? []) {
      result.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);

  // Any category whose parent got deleted/loops back never reached by walk(null,...)
  const seen = new Set(result.map((c) => c.id));
  for (const c of categories) {
    if (!seen.has(c.id)) result.push({ ...c, depth: 0 });
  }
  return result;
}

export function CategoryManager({ categories, canManage }: CategoryManagerProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  const tree = useMemo(() => flattenTree(categories), [categories]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(category: CategoryRow) {
    setEditingId(category.id);
    setForm({ name: category.name, description: category.description ?? "", parentId: category.parentId ?? "" });
    setError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      name: form.name,
      description: form.description || null,
      parentId: form.parentId || null,
    };
    startSave(async () => {
      const result = editingId ? await updateCategory(editingId, payload) : await createCategory(payload);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(editingId ? "Category updated." : "Category created.");
      closeForm();
      router.refresh();
    });
  }

  function handleDelete(category: CategoryRow) {
    if (!confirm(`Delete category "${category.name}"? Articles keep their content but lose this category.`)) return;
    setDeletingId(category.id);
    startDelete(async () => {
      const result = await deleteCategory(category.id);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        setDeletingId(null);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && !formOpen && (
        <Button onClick={openCreate} className="w-fit">
          <FolderPlus className="size-4" />
          New category
        </Button>
      )}

      {formOpen && (
        <Card glass>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{editingId ? "Edit category" : "New category"}</CardTitle>
            <Button variant="ghost" size="sm" onClick={closeForm} aria-label="Close">
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <FormField label="Name" htmlFor="category-name" required>
                <Input
                  id="category-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </FormField>
              <FormField label="Description" htmlFor="category-description">
                <Input
                  id="category-description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </FormField>
              <FormField label="Parent category" htmlFor="category-parent">
                <Select
                  id="category-parent"
                  value={form.parentId}
                  onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                >
                  <option value="">No parent (top-level)</option>
                  {categories
                    .filter((c) => c.id !== editingId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              </FormField>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-3">
                <Button type="submit" disabled={saving || !form.name.trim()}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="ghost" onClick={closeForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {tree.length === 0 ? (
        <Card glass>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">No categories yet.</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {tree.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-3 p-4"
                style={{ paddingLeft: `${1 + category.depth * 1.5}rem` }}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{category.name}</span>
                    <Badge variant="outline">{category.articleCount} article{category.articleCount === 1 ? "" : "s"}</Badge>
                  </div>
                  {category.description && <p className="text-sm text-muted-foreground">{category.description}</p>}
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(category)} aria-label={`Edit ${category.name}`}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(category)}
                      disabled={deleting && deletingId === category.id}
                      aria-label={`Delete ${category.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
