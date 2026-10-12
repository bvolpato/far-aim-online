import { createContext, useContext } from 'react';
import type { AIMChapter, FARPart, FlashcardDeck } from '../data';

export interface RouteData {
  farPart?: FARPart;
  aimChapter?: AIMChapter;
  flashcardDeck?: FlashcardDeck;
}

export const RouteDataContext = createContext<RouteData>({});

export function useRouteData() {
  return useContext(RouteDataContext);
}

export async function loadRouteData(pathname: string): Promise<RouteData> {
  const far = pathname.match(/^\/far\/(\d+)\/?$/);
  if (far) {
    const { getFARPart } = await import('../data');
    return { farPart: await getFARPart(Number(far[1])) };
  }
  const aim = pathname.match(/^\/aim\/(\d+)\/?$/);
  if (aim) {
    const { getAIMChapter } = await import('../data');
    return { aimChapter: await getAIMChapter(Number(aim[1])) };
  }
  const flashcardDeck = pathname.match(/^\/flashcards\/([a-z0-9-]+)\/?$/);
  if (flashcardDeck) {
    const { getFlashcardDeck } = await import('../data');
    return { flashcardDeck: await getFlashcardDeck(flashcardDeck[1]) };
  }
  return {};
}
