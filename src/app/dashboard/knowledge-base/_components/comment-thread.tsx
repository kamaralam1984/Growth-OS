"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { addKnowledgeArticleComment } from "../_lib/comment-actions";

export interface CommentRow {
  id: string;
  content: string;
  authorName: string | null;
  createdAt: string;
}

export interface CommentThreadProps {
  articleId: string;
  comments: CommentRow[];
}

/** Comment thread for a Knowledge Base article — any active org member who can view the article may post, using the generic Comment model (docKind: "KNOWLEDGE_ARTICLE"). */
export function CommentThread({ articleId, comments }: CommentThreadProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    startTransition(async () => {
      const result = await addKnowledgeArticleComment(articleId, content);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      setContent("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Add a comment…"
          className="w-full resize-y rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="sm" className="w-fit" disabled={pending || !content.trim()}>
          <Send className="size-4" /> {pending ? "Posting…" : "Post comment"}
        </Button>
      </form>

      {comments.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="size-4" /> No comments yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-col gap-1 p-3.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.authorName ?? "A team member"}</span>
                  <span>{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{c.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
