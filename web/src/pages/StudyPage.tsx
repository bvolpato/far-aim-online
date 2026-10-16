import { useRef, useState, useEffect, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
    GraduationCap,
    Brain,
    Layers,
    ChevronRight,
    Play,
    BookOpen,
    FileText,
    Trophy,
    Target,
    Bookmark,
    StickyNote,
    CheckCircle2,
    Highlighter,
    Trash2,
    Route,
    Download,
    Upload,
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    getAllQuizzes,
    getAllFlashcardDecks,
    getQuizzesByCategory,
    getFlashcardDecksByCategory,
    getStudyPaths,
    type StudyPathReference,
} from '../data/catalog';
import { useStudyMarks } from '@/hooks/useStudyMarks';
import { downloadStudyPack, importStudyPackFile } from '@/lib/studyPack';

const QUICK_START_QUIZ_IDS = ['private-pilot-far', 'airspace-quiz', 'far-part43-maintenance'];

function markBadgeVariant(type: 'far' | 'aim' | 'ac') {
    if (type === 'far') return 'far';
    if (type === 'aim') return 'aim';
    return 'ac';
}

function getReferenceLink(reference: StudyPathReference) {
    if (reference.type === 'far' && reference.part) {
        return `/far/${reference.part}`;
    }
    if (reference.type === 'aim' && reference.chapter) {
        return `/aim/${reference.chapter}`;
    }
    return '/study';
}

export function StudyPage() {
    const quizzes = getAllQuizzes();
    const flashcardDecks = getAllFlashcardDecks();
    const studyPaths = getStudyPaths();
    const { marks, stats, markReviewed, removeMark, replaceMarks } = useStudyMarks();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [studyPackMessage, setStudyPackMessage] = useState<string | null>(null);
    const totalQuestions = quizzes.reduce((sum, q) => sum + q.questionCount, 0);
    const totalCards = flashcardDecks.reduce((sum, d) => sum + d.cardCount, 0);

    const quizzesByCat = getQuizzesByCategory();
    const flashcardsByCat = getFlashcardDecksByCategory();

    const quickStartQuizzes = [
        ...QUICK_START_QUIZ_IDS.flatMap((id) => quizzes.filter((quiz) => quiz.id === id)),
        ...quizzes.filter((quiz) => !QUICK_START_QUIZ_IDS.includes(quiz.id)),
    ].slice(0, 3);
    const reviewQueue = marks.filter((mark) => mark.saved || mark.highlighted || mark.note || mark.reviewedAt);

    useEffect(() => {
        if (window.location.hash === '#saved-study-marks') {
            const timeout = setTimeout(() => {
                document.getElementById('saved-study-marks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, []);

    const handleStudyPackExport = () => {
        const pack = downloadStudyPack();
        setStudyPackMessage(`Exported ${pack.studyMarks.length} saved items.`);
    };

    const handleStudyPackImport = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const result = await importStudyPackFile(file);
            replaceMarks(result.studyMarks);
            setStudyPackMessage(
                `Imported ${result.marksImported} saved items, ${result.historyImported} history entries, and ${result.searchHistoryImported} searches.`
            );
        } catch (error) {
            setStudyPackMessage(error instanceof Error ? error.message : 'Import failed.');
        } finally {
            event.target.value = '';
        }
    };

    return (
        <>
            <Helmet>
                <title>Study Hub — FAR/AIM Online</title>
                <meta
                    name="description"
                    content={`Study aviation with ${totalQuestions}+ quiz questions and ${totalCards}+ flashcards covering FAR, AIM, and more.`}
                />
            </Helmet>

            <div className="animate-fade-in">
                {/* Hero Stats Card */}
                <section className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
                        <div className="text-center space-y-6">
                            <div className="w-16 h-16 mx-auto rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                                <GraduationCap className="w-9 h-9" />
                            </div>
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-bold">Study Hub</h1>
                                <p className="text-blue-100 mt-2">
                                    Quizzes, flashcards, and study materials in one place
                                </p>
                            </div>
                            <div className="flex justify-center gap-8 sm:gap-16">
                                <div className="text-center">
                                    <p className="text-3xl font-bold">{quizzes.length}</p>
                                    <p className="text-sm text-blue-200">Quizzes</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-3xl font-bold">{totalQuestions}</p>
                                    <p className="text-sm text-blue-200">Questions</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-3xl font-bold">{totalCards}</p>
                                    <p className="text-sm text-blue-200">Cards</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
                    {/* Quick Start */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <Play className="w-5 h-5 text-primary" />
                            <h2 className="text-xl font-semibold text-foreground">Quick Start</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {quickStartQuizzes.map((quiz) => (
                                <Link
                                    key={quiz.id}
                                    to={`/quizzes/${quiz.id}`}
                                    className="group flex items-center gap-3 p-4 rounded-lg border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        <Play className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                            {quiz.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {quiz.questionCount} questions
                                        </p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                </Link>
                            ))}
                        </div>
                    </section>

                    <Separator />

                    {/* Certificate Study Paths */}
                    <section>
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Route className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                                <h2 className="text-xl font-semibold text-foreground">Certificate Paths</h2>
                                <Badge variant="secondary">{studyPaths.length} paths</Badge>
                            </div>
                        </div>

                        <div className="grid lg:grid-cols-2 gap-4">
                            {studyPaths.map((path) => {
                                const linkedQuizzes = path.quizIds.filter((id) => Boolean(quizzes.find((quiz) => quiz.id === id))).length;
                                const linkedDecks = path.flashcardDeckIds.filter((id) => Boolean(flashcardDecks.find((deck) => deck.id === id))).length;

                                return (
                                    <Card key={path.id} className="overflow-hidden">
                                        <CardHeader className="pb-3">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="mb-2 flex items-center gap-2">
                                                        <Badge variant="secondary">{path.category}</Badge>
                                                        <span className="text-xs text-muted-foreground">
                                                            {path.references.length} refs
                                                        </span>
                                                    </div>
                                                    <CardTitle className="text-lg">{path.title}</CardTitle>
                                                    <CardDescription>{path.subtitle}</CardDescription>
                                                </div>
                                                <div className="rounded-lg bg-primary/10 p-2">
                                                    <Route className="h-5 w-5 text-primary" />
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <p className="text-sm text-muted-foreground">{path.description}</p>
                                            <div className="grid grid-cols-2 gap-2 text-center text-xs text-muted-foreground sm:grid-cols-3">
                                                <div className="rounded-md border bg-muted/30 px-2 py-2">
                                                    <p className="font-semibold text-foreground">{path.references.length}</p>
                                                    <p>references</p>
                                                </div>
                                                <div className="rounded-md border bg-muted/30 px-2 py-2">
                                                    <p className="font-semibold text-foreground">{linkedQuizzes}</p>
                                                    <p>quizzes</p>
                                                </div>
                                                <div className="rounded-md border bg-muted/30 px-2 py-2">
                                                    <p className="font-semibold text-foreground">{linkedDecks}</p>
                                                    <p>decks</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {path.references.slice(0, 6).map((reference) => (
                                                    <Button
                                                        key={`${path.id}-${reference.label}`}
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-auto min-h-9 justify-start text-left"
                                                        asChild
                                                    >
                                                        <Link to={getReferenceLink(reference)}>
                                                            {reference.label}
                                                        </Link>
                                                    </Button>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </section>

                    <Separator />

                    {/* Saved Study Queue */}
                    <section id="saved-study-marks" className="scroll-mt-24">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <Bookmark className="w-5 h-5 text-primary" />
                                <h2 className="text-xl font-semibold text-foreground">Saved & Notes</h2>
                                <Badge variant="secondary">{stats.total} saved items</Badge>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-center text-xs text-muted-foreground sm:w-80">
                                <div className="rounded-md border bg-card px-2 py-1">
                                    <p className="font-semibold text-foreground">{stats.saved}</p>
                                    <p>saved</p>
                                </div>
                                <div className="rounded-md border bg-card px-2 py-1">
                                    <p className="font-semibold text-foreground">{stats.highlighted}</p>
                                    <p>marked</p>
                                </div>
                                <div className="rounded-md border bg-card px-2 py-1">
                                    <p className="font-semibold text-foreground">{stats.withNotes}</p>
                                    <p>notes</p>
                                </div>
                                <div className="rounded-md border bg-card px-2 py-1">
                                    <p className="font-semibold text-foreground">{stats.reviewed}</p>
                                    <p>reviewed</p>
                                </div>
                            </div>
                        </div>

                        <Card className="mb-4 border-dashed">
                            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="font-semibold text-foreground">Portable Study Pack</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Move saved sections, notes, highlights, recent reading, and search history between devices.
                                    </p>
                                    {studyPackMessage && (
                                        <p className="mt-2 text-sm font-medium text-primary">{studyPackMessage}</p>
                                    )}
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2">
                                    <Button type="button" variant="outline" onClick={handleStudyPackExport}>
                                        <Download className="mr-2 h-4 w-4" />
                                        Export
                                    </Button>
                                    <Button type="button" onClick={() => fileInputRef.current?.click()}>
                                        <Upload className="mr-2 h-4 w-4" />
                                        Import
                                    </Button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="application/json"
                                        className="hidden"
                                        aria-label="Import study pack"
                                        data-testid="study-pack-input"
                                        onChange={handleStudyPackImport}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {reviewQueue.length > 0 ? (
                            <div className="grid gap-3">
                                {reviewQueue.map((mark) => (
                                    <Card key={mark.key}>
                                        <CardContent className="p-4">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0 flex-1">
                                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                                        <Badge variant={markBadgeVariant(mark.type)}>
                                                            {mark.reference}
                                                        </Badge>
                                                        {mark.note && (
                                                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                                <StickyNote className="h-3 w-3" />
                                                                note
                                                            </span>
                                                        )}
                                                        {mark.highlighted && (
                                                            <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                                                                <Highlighter className="h-3 w-3" />
                                                                highlighted
                                                            </span>
                                                        )}
                                                        {mark.reviewedAt && (
                                                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                                                                <CheckCircle2 className="h-3 w-3" />
                                                                reviewed
                                                            </span>
                                                        )}
                                                    </div>
                                                    <Link
                                                        to={mark.path}
                                                        className="font-semibold text-foreground hover:text-primary"
                                                    >
                                                        {mark.title}
                                                    </Link>
                                                    {mark.note && (
                                                        <p className="mt-2 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
                                                            {mark.note}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex shrink-0 gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => markReviewed(mark)}
                                                    >
                                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                                        Review
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => removeMark(mark.key)}
                                                        aria-label={`Remove ${mark.reference}`}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <Card>
                                <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <h3 className="font-semibold text-foreground">Build a checkride review queue</h3>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Save FAR or AIM sections, add CFI notes, then mark each item reviewed as you study.
                                        </p>
                                    </div>
                                    <Button asChild>
                                        <Link to="/far/61">Start with Part 61</Link>
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </section>

                    <Separator />

                    {/* Quizzes Section */}
                    <section>
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Brain className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                <h2 className="text-xl font-semibold text-foreground">Practice Quizzes</h2>
                                <Badge variant="quiz">{quizzes.length} quizzes</Badge>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                                <Link to="/quizzes">View All</Link>
                            </Button>
                        </div>

                        <div className="grid min-w-0 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* FAR Quizzes */}
                            <Card className="min-w-0">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-blue-600" />
                                        <CardTitle className="text-base">FAR Quizzes</CardTitle>
                                    </div>
                                    <CardDescription>{quizzesByCat.far.length} quizzes</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {quizzesByCat.far.slice(0, 4).map((q) => (
                                        <Link
                                            key={q.id}
                                            to={`/quizzes/${q.id}`}
                                            className="flex min-h-11 min-w-0 items-center justify-between gap-2 py-2 text-sm transition-colors hover:text-primary"
                                        >
                                            <span className="min-w-0 flex-1 break-words">{q.title}</span>
                                            <Badge variant="secondary" className="shrink-0 ml-2">
                                                {q.questionCount}q
                                            </Badge>
                                        </Link>
                                    ))}
                                    {quizzesByCat.far.length > 4 && (
                                        <Link
                                            to="/quizzes"
                                            className="block text-xs text-primary hover:underline mt-2"
                                        >
                                            +{quizzesByCat.far.length - 4} more →
                                        </Link>
                                    )}
                                </CardContent>
                            </Card>

                            {/* AIM Quizzes */}
                            <Card className="min-w-0">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-emerald-600" />
                                        <CardTitle className="text-base">AIM Quizzes</CardTitle>
                                    </div>
                                    <CardDescription>{quizzesByCat.aim.length} quizzes</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {quizzesByCat.aim.slice(0, 4).map((q) => (
                                        <Link
                                            key={q.id}
                                            to={`/quizzes/${q.id}`}
                                            className="flex min-h-11 min-w-0 items-center justify-between gap-2 py-2 text-sm transition-colors hover:text-primary"
                                        >
                                            <span className="min-w-0 flex-1 break-words">{q.title}</span>
                                            <Badge variant="secondary" className="shrink-0 ml-2">
                                                {q.questionCount}q
                                            </Badge>
                                        </Link>
                                    ))}
                                    {quizzesByCat.aim.length > 4 && (
                                        <Link
                                            to="/quizzes"
                                            className="block text-xs text-primary hover:underline mt-2"
                                        >
                                            +{quizzesByCat.aim.length - 4} more →
                                        </Link>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Misc Quizzes */}
                            <Card className="min-w-0">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center gap-2">
                                        <Target className="w-4 h-4 text-rose-600" />
                                        <CardTitle className="text-base">Challenge</CardTitle>
                                    </div>
                                    <CardDescription>{quizzesByCat.misc.length} quizzes</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {quizzesByCat.misc.map((q) => (
                                        <Link
                                            key={q.id}
                                            to={`/quizzes/${q.id}`}
                                            className="flex min-h-11 min-w-0 items-center justify-between gap-2 py-2 text-sm transition-colors hover:text-primary"
                                        >
                                            <span className="min-w-0 flex-1 break-words">{q.title}</span>
                                            <Badge variant="secondary" className="shrink-0 ml-2">
                                                {q.questionCount}q
                                            </Badge>
                                        </Link>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>
                    </section>

                    <Separator />

                    {/* Flashcards Section */}
                    <section>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <Layers className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                <h2 className="text-xl font-semibold text-foreground">Flashcards</h2>
                                <Badge variant="flashcard">{flashcardDecks.length} decks</Badge>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                                <Link to="/flashcards">View All</Link>
                            </Button>
                        </div>

                        <div className="grid min-w-0 sm:grid-cols-2 gap-4">
                            {/* FAR Flashcards */}
                            <Card className="min-w-0">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-blue-600" />
                                        <CardTitle className="text-base">FAR Flashcards</CardTitle>
                                    </div>
                                    <CardDescription>{flashcardsByCat.far.length} decks</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {flashcardsByCat.far.map((d) => (
                                        <Link
                                            key={d.id}
                                            to={`/flashcards/${d.id}`}
                                            className="flex min-h-11 min-w-0 items-center justify-between gap-2 py-2 text-sm transition-colors hover:text-primary"
                                        >
                                            <span className="min-w-0 flex-1 break-words">{d.title}</span>
                                            <Badge variant="secondary" className="shrink-0 ml-2">
                                                {d.cardCount} cards
                                            </Badge>
                                        </Link>
                                    ))}
                                </CardContent>
                            </Card>

                            {/* AIM Flashcards */}
                            <Card className="min-w-0">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-emerald-600" />
                                        <CardTitle className="text-base">AIM Flashcards</CardTitle>
                                    </div>
                                    <CardDescription>{flashcardsByCat.aim.length} decks</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {flashcardsByCat.aim.map((d) => (
                                        <Link
                                            key={d.id}
                                            to={`/flashcards/${d.id}`}
                                            className="flex min-h-11 min-w-0 items-center justify-between gap-2 py-2 text-sm transition-colors hover:text-primary"
                                        >
                                            <span className="min-w-0 flex-1 break-words">{d.title}</span>
                                            <Badge variant="secondary" className="shrink-0 ml-2">
                                                {d.cardCount} cards
                                            </Badge>
                                        </Link>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>
                    </section>

                    {/* Study Tips CTA */}
                    <Card className="bg-gradient-to-r from-primary/5 to-indigo-500/5 border-primary/20">
                        <CardContent className="flex flex-col sm:flex-row items-center gap-4 py-6">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                <Trophy className="w-6 h-6 text-primary" />
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                                <h3 className="font-semibold text-foreground">
                                    Study Tip: Space your sessions
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Research shows that spacing study sessions over time (spaced repetition) is more effective than cramming. Try reviewing one quiz and one flashcard deck per day.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
}
