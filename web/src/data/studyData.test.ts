import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('lazy study data', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('serves list metadata without fetching quiz or flashcard payloads', async () => {
    const data = await import('./catalog');

    expect(data.getAllQuizzes().length).toBeGreaterThan(0);
    expect(data.getAllFlashcardDecks().length).toBeGreaterThan(0);
    expect(data.getAllQuizzes()[0]).not.toHaveProperty('questions');
    expect(data.getAllFlashcardDecks()[0]).not.toHaveProperty('cards');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads a quiz on demand and shares the in-flight request', async () => {
    const quiz = {
      id: 'hard-challenge',
      title: 'Ultimate Pilot Challenge',
      description: 'A practice quiz',
      category: 'Miscellaneous',
      difficulty: 'hard',
      targetCertificate: 'All Pilots',
      questionCount: 1,
      passingScore: 70,
      questions: [{
        id: 'q1', question: 'Question?', options: ['A', 'B'],
        correctAnswer: 0, explanation: 'Because.', reference: 'FAR Part 91',
      }],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(quiz), { status: 200 }));
    const data = await import('./study');

    const first = data.getQuiz(quiz.id);
    const second = data.getQuiz(quiz.id);

    expect(first).toBe(second);
    await expect(first).resolves.toMatchObject(quiz);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a failed request and does not cache the failure', async () => {
    const quiz = {
      id: 'hard-challenge',
      title: 'Ultimate Pilot Challenge',
      description: 'A practice quiz',
      category: 'Miscellaneous',
      difficulty: 'hard',
      targetCertificate: 'All Pilots',
      questionCount: 0,
      passingScore: 70,
      questions: [],
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(quiz), { status: 200 }));
    const data = await import('./study');

    await expect(data.getQuiz(quiz.id)).rejects.toThrow('503');
    await expect(data.getQuiz(quiz.id)).resolves.toMatchObject(quiz);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('loads flashcard content only for a requested deck', async () => {
    const deck = {
      id: 'far-definitions',
      title: 'FAR Definitions',
      description: 'Definitions',
      category: 'FAR',
      cardCount: 1,
      cards: [{ id: 'card1', front: 'Front', back: 'Back', reference: 'FAR Part 1' }],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(deck), { status: 200 }));
    const data = await import('./study');

    await expect(data.getFlashcardDeck(deck.id)).resolves.toMatchObject(deck);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reuses successfully fetched reference content across navigation', async () => {
    const chapter = { chapter: 1, title: 'Introduction', sections: [] };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(chapter), { status: 200 }));
    const data = await import('./index');

    await expect(data.getAIMChapter(1)).resolves.toMatchObject(chapter);
    await expect(data.getAIMChapter(1)).resolves.toMatchObject(chapter);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns no payload for an unknown study id without fetching', async () => {
    const study = await import('./study');

    await expect(study.getQuiz('missing-quiz')).resolves.toBeUndefined();
    await expect(study.getFlashcardDeck('missing-deck')).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
