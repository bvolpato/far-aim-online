import { memo, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  markStudyMarkReviewed,
  removeStudyMark,
  saveStudyMarkNote,
  toggleStudyMarkHighlighted,
  toggleStudyMarkSaved,
  useStudyMark,
  type StudyMarkInput,
} from '@/hooks/useStudyMarks';

interface StudyMarkToolsProps extends StudyMarkInput {
  compact?: boolean;
}

export const StudyMarkTools = memo(function StudyMarkTools({
  compact = false,
  type,
  reference,
  title,
  path,
}: StudyMarkToolsProps) {
  const mark = useStudyMark(type, reference);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(mark?.note || '');
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const noteId = `note-${type}-${reference.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;

  useEffect(() => {
    setDraft(mark?.note || '');
  }, [mark?.note]);

  const hasNote = Boolean(mark?.note);
  const isSaved = Boolean(mark?.saved);
  const isHighlighted = Boolean(mark?.highlighted);
  const isReviewed = Boolean(mark?.reviewedAt);
  const sizeClass = compact ? 'sm-btn sm-btn-c' : 'sm-btn';

  const getInput = (): StudyMarkInput => ({ type, reference, title, path });

  const shareReference = async () => {
    const shareUrl = `${window.location.origin}${path}`;
    const shareText = `${reference} - ${title}\n${shareUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${reference} - ${title}`,
          text: `${reference} - ${title}`,
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
    <div className={compact ? undefined : 'rounded-lg border border-border bg-muted/30 p-3'}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${sizeClass} ${isSaved ? 'sm-btn-p' : 'sm-btn-o'}`}
          onClick={() => toggleStudyMarkSaved(getInput())}
          aria-label={`${isSaved ? 'Remove saved mark for' : 'Save'} ${reference}`}
        >
          <svg className={isSaved ? 'sm-ico fill-current' : 'sm-ico'} aria-hidden="true">
            <use href="#sm-bm" />
          </svg>
          {isSaved ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          className={`${sizeClass} ${hasNote || noteOpen ? 'sm-btn-s' : 'sm-btn-o'}`}
          onClick={() => setNoteOpen((value) => !value)}
          aria-label={`${hasNote ? 'Edit note for' : 'Add note for'} ${reference}`}
        >
          <svg className="sm-ico" aria-hidden="true">
            <use href="#sm-nt" />
          </svg>
          {hasNote ? 'Note' : 'Add note'}
        </button>
        <button
          type="button"
          className={`${sizeClass} ${isHighlighted ? 'sm-btn-s' : 'sm-btn-o'}`}
          onClick={() => toggleStudyMarkHighlighted(getInput())}
          aria-label={`${isHighlighted ? 'Remove highlight for' : 'Highlight'} ${reference}`}
        >
          <svg className={isHighlighted ? 'sm-ico text-amber-600' : 'sm-ico'} aria-hidden="true">
            <use href="#sm-hl" />
          </svg>
          {isHighlighted ? 'Highlighted' : 'Highlight'}
        </button>
        <button
          type="button"
          className={`${sizeClass} ${isReviewed ? 'sm-btn-s' : 'sm-btn-o'}`}
          onClick={() => markStudyMarkReviewed(getInput())}
          aria-label={`Mark ${reference} reviewed`}
        >
          <svg className={isReviewed ? 'sm-ico text-emerald-600' : 'sm-ico'} aria-hidden="true">
            <use href="#sm-ok" />
          </svg>
          {isReviewed ? 'Reviewed' : 'Review'}
        </button>
        <button
          type="button"
          className={`${sizeClass} sm-btn-o`}
          onClick={() => void shareReference()}
          aria-label={`Share ${reference}`}
        >
          <svg className="sm-ico" aria-hidden="true">
            <use href="#sm-sh" />
          </svg>
          {shareStatus === 'copied' ? 'Copied' : 'Share'}
        </button>
        {mark && (
          <button
            type="button"
            className={`${sizeClass} sm-btn-g`}
            onClick={() => removeStudyMark(mark.key)}
            aria-label={`Clear study mark for ${reference}`}
          >
            <svg className="sm-ico-only" aria-hidden="true">
              <use href="#sm-tr" />
            </svg>
          </button>
        )}
      </div>

      {noteOpen && (
        <form
          className={compact ? 'mt-3 max-w-2xl space-y-2' : 'mt-3 space-y-2'}
          onSubmit={(event) => {
            event.preventDefault();
            saveStudyMarkNote(getInput(), draft);
            setNoteOpen(false);
          }}
        >
          <label className="sr-only" htmlFor={noteId}>
            Note for {reference}
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
            <Button type="submit" size="sm" aria-label={`Save note for ${reference}`}>
              Save note
            </Button>
          </div>
        </form>
      )}
    </div>
  );
});
