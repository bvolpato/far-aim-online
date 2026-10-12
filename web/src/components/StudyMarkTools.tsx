import { useEffect, useState } from 'react';
import { Bookmark, CheckCircle2, Highlighter, Share2, StickyNote, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudyMarks, type StudyMarkInput } from '@/hooks/useStudyMarks';
import { cn } from '@/lib/utils';

interface StudyMarkToolsProps extends StudyMarkInput {
  compact?: boolean;
}

export function StudyMarkTools({ compact = false, ...input }: StudyMarkToolsProps) {
  const { getMark, toggleSaved, toggleHighlighted, saveNote, markReviewed, removeMark } = useStudyMarks();
  const mark = getMark(input.type, input.reference);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(mark?.note || '');
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const noteId = `note-${input.type}-${input.reference.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;

  useEffect(() => {
    setDraft(mark?.note || '');
  }, [mark?.note]);

  const hasNote = Boolean(mark?.note);
  const isSaved = Boolean(mark?.saved);
  const isHighlighted = Boolean(mark?.highlighted);
  const isReviewed = Boolean(mark?.reviewedAt);
  const shareReference = async () => {
    const shareUrl = `${window.location.origin}${input.path}`;
    const shareText = `${input.reference} - ${input.title}\n${shareUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${input.reference} - ${input.title}`,
          text: `${input.reference} - ${input.title}`,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareText);
      setShareStatus('copied');
      window.setTimeout(() => setShareStatus('idle'), 1600);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Failed to share reference', error);
    }
  };

  return (
    <div className={cn(
      'rounded-lg border border-border bg-muted/30 p-3',
      compact && 'border-transparent bg-transparent p-0'
    )}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={isSaved ? 'default' : 'outline'}
          size="sm"
          className={compact ? 'h-8' : undefined}
          onClick={() => toggleSaved(input)}
          aria-label={`${isSaved ? 'Remove saved mark for' : 'Save'} ${input.reference}`}
        >
          <Bookmark className={cn('mr-2 h-4 w-4', isSaved && 'fill-current')} />
          {isSaved ? 'Saved' : 'Save'}
        </Button>
        <Button
          type="button"
          variant={hasNote || noteOpen ? 'secondary' : 'outline'}
          size="sm"
          className={compact ? 'h-8' : undefined}
          onClick={() => setNoteOpen((value) => !value)}
          aria-label={`${hasNote ? 'Edit note for' : 'Add note for'} ${input.reference}`}
        >
          <StickyNote className="mr-2 h-4 w-4" />
          {hasNote ? 'Note' : 'Add note'}
        </Button>
        <Button
          type="button"
          variant={isHighlighted ? 'secondary' : 'outline'}
          size="sm"
          className={compact ? 'h-8' : undefined}
          onClick={() => toggleHighlighted(input)}
          aria-label={`${isHighlighted ? 'Remove highlight for' : 'Highlight'} ${input.reference}`}
        >
          <Highlighter className={cn('mr-2 h-4 w-4', isHighlighted && 'text-amber-600')} />
          {isHighlighted ? 'Highlighted' : 'Highlight'}
        </Button>
        <Button
          type="button"
          variant={isReviewed ? 'secondary' : 'outline'}
          size="sm"
          className={compact ? 'h-8' : undefined}
          onClick={() => markReviewed(input)}
          aria-label={`Mark ${input.reference} reviewed`}
        >
          <CheckCircle2 className={cn('mr-2 h-4 w-4', isReviewed && 'text-emerald-600')} />
          {isReviewed ? 'Reviewed' : 'Review'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={compact ? 'h-8' : undefined}
          onClick={() => void shareReference()}
          aria-label={`Share ${input.reference}`}
        >
          <Share2 className="mr-2 h-4 w-4" />
          {shareStatus === 'copied' ? 'Copied' : 'Share'}
        </Button>
        {mark && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={compact ? 'h-8 px-2' : undefined}
            onClick={() => removeMark(mark.key)}
            aria-label={`Clear study mark for ${input.reference}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {noteOpen && (
        <form
          className={cn('mt-3 space-y-2', compact && 'max-w-2xl')}
          onSubmit={(event) => {
            event.preventDefault();
            saveNote(input, draft);
            setNoteOpen(false);
          }}
        >
          <label className="sr-only" htmlFor={noteId}>
            Note for {input.reference}
          </label>
          <textarea
            id={noteId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            placeholder="Add checkride mnemonics, CFI comments, or personal gotchas..."
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" aria-label={`Save note for ${input.reference}`}>
              Save note
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
