import { getAIMChapterMeta, getFARPartMeta } from '../data/catalog';
import { formatAIMChapterLabel } from './aim';

export interface DirectJumpTarget {
  type: 'far' | 'aim' | 'ac';
  label: string;
  subtitle: string;
  to: string;
}

export function resolveDirectJump(rawQuery: string): DirectJumpTarget | null {
  const trimmed = rawQuery.trim();
  if (!trimmed || trimmed.length > 48) return null;

  // FAR section: "91.205", "§ 91.205", "14 CFR 91.205", "FAR 61.57"
  const farSection = trimmed.match(/^(?:(?:14|49)\s*cfr\s*)?(?:far\s*)?(?:§\s*)?(\d{1,4})\.(\d+[a-z]?)$/i);
  if (farSection) {
    const partNum = Number(farSection[1]);
    const section = `${farSection[1]}.${farSection[2]}`;
    const meta = getFARPartMeta(partNum);
    if (meta) {
      return {
        type: 'far',
        label: `§ ${section}`,
        subtitle: `14 CFR Part ${meta.part}: ${meta.title}`,
        to: `/far/${meta.part}#${section}`,
      };
    }
  }

  // FAR part: "Part 91", "14 CFR 61", "14 CFR Part 43", "FAR 91"
  const farPart = trimmed.match(/^(?:(?:14|49)\s*cfr\s*(?:part\s*)?|far\s*(?:part\s*)?|part\s+)(\d{1,4})$/i);
  if (farPart) {
    const partNum = Number(farPart[1]);
    const meta = getFARPartMeta(partNum);
    if (meta) {
      return {
        type: 'far',
        label: `FAR Part ${meta.part}`,
        subtitle: meta.title,
        to: `/far/${meta.part}`,
      };
    }
  }

  // AIM section: "4-3-2", "AIM 4-3-2"
  const aimSection = trimmed.match(/^(?:aim\s*)?(\d{1,2})-(\d{1,2})-(\d{1,2})$/i);
  if (aimSection) {
    const chapterNum = Number(aimSection[1]);
    const section = `${aimSection[1]}-${aimSection[2]}-${aimSection[3]}`;
    const meta = getAIMChapterMeta(chapterNum);
    if (meta) {
      return {
        type: 'aim',
        label: `AIM ${section}`,
        subtitle: `${formatAIMChapterLabel(meta.chapter)}: ${meta.title}`,
        to: `/aim/${meta.chapter}#${section}`,
      };
    }
  }

  // AIM chapter: "AIM 4", "AIM Chapter 4", "AIM Ch 5"
  const aimChapter = trimmed.match(/^aim\s*(?:ch(?:apter)?\.?\s*)?(\d{1,2})$/i);
  if (aimChapter) {
    const chapterNum = Number(aimChapter[1]);
    const meta = getAIMChapterMeta(chapterNum);
    if (meta) {
      return {
        type: 'aim',
        label: `AIM ${formatAIMChapterLabel(meta.chapter)}`,
        subtitle: meta.title,
        to: `/aim/${meta.chapter}`,
      };
    }
  }

  // Advisory Circular: "AC 91-57", "AC 61-65K"
  const acMatch = trimmed.match(/^ac\s+([\d./-]+(?:[a-z])?)$/i);
  if (acMatch) {
    const number = acMatch[1].toUpperCase();
    return {
      type: 'ac',
      label: `AC ${number}`,
      subtitle: 'Filter Advisory Circulars catalog',
      to: `/advisory-circulars?q=${encodeURIComponent(`AC ${number}`)}`,
    };
  }

  return null;
}
