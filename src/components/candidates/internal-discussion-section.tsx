'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, Pencil, Trash2, Save, X, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { initials } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

export interface DiscussionItem {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string };
}

interface InternalDiscussionSectionProps {
  kind: 'note' | 'comment';
  candidateId: string;
  apiBasePath: string; // e.g. `/api/candidates/${id}/notes`
  initialItems: DiscussionItem[];
  placeholder: string;
  maxLength: number;
}

export function InternalDiscussionSection({
  kind,
  candidateId: _candidateId,
  apiBasePath,
  initialItems,
  placeholder,
  maxLength,
}: InternalDiscussionSectionProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const [items, setItems] = React.useState(initialItems);
  const [draft, setDraft] = React.useState('');
  const [posting, setPosting] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  React.useEffect(() => setItems(initialItems), [initialItems]);

  const currentUserId = session?.user?.id;
  const isAdmin = session?.user?.orgRole === 'ADMIN' || session?.user?.orgRole === 'OWNER';

  function canModify(item: DiscussionItem) {
    return item.author.id === currentUserId || isAdmin;
  }

  async function handleCreate() {
    if (draft.trim().length === 0) {
      toast({ variant: 'error', title: `${kind === 'note' ? 'Note' : 'Comment'} cannot be empty` });
      return;
    }
    setPosting(true);
    try {
      const res = await fetch(apiBasePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: `Could not add ${kind}`, description: data.error });
        return;
      }
      const created: DiscussionItem = data[kind];
      setItems((prev) => [created, ...prev]);
      setDraft('');
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setPosting(false);
    }
  }

  async function handleSaveEdit(id: string) {
    if (editDraft.trim().length === 0) return;
    setBusyId(id);
    try {
      const res = await fetch(`${apiBasePath}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editDraft }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: `Could not update ${kind}`, description: data.error });
        return;
      }
      const updated: DiscussionItem = data[kind];
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setEditingId(null);
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`${apiBasePath}/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ variant: 'error', title: `Could not delete ${kind}`, description: data.error });
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setBusyId(null);
      setDeleteId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        Internal only — candidates never see {kind === 'note' ? 'notes' : 'comments'}.
      </div>

      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          rows={3}
          maxLength={maxLength}
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={handleCreate} disabled={posting}>
            {posting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {kind === 'note' ? 'Add note' : 'Post comment'}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {kind === 'note' ? 'notes' : 'comments'} yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex gap-3 p-4">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback>{initials(item.author.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{item.author.name}</span>
                    <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                    {item.updatedAt !== item.createdAt && <span>(edited)</span>}
                  </div>

                  {editingId === item.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        maxLength={maxLength}
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)} disabled={busyId === item.id}>
                          <X className="h-3.5 w-3.5" /> Cancel
                        </Button>
                        <Button type="button" size="sm" onClick={() => handleSaveEdit(item.id)} disabled={busyId === item.id}>
                          {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap text-sm">{item.body}</p>
                      {canModify(item) && (
                        <div className="flex gap-1 pt-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingId(item.id);
                              setEditDraft(item.body);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/5 hover:text-destructive"
                            onClick={() => setDeleteId(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this {kind}?</DialogTitle>
            <DialogDescription>This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={!!busyId}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)} disabled={!!busyId}>
              {busyId === deleteId && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
