import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, Check, X, RotateCcw, Trophy, BookOpen, ExternalLink } from 'lucide-react';
import { getQuizMetadata } from '../data/catalog';
import { getQuiz } from '../data/study';
import type { Quiz, QuizQuestion } from '../data';
import { AirplaneCelebration } from '../components/AirplaneCelebration';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Progress } from '../components/ui/progress';

type QuizState = 'intro' | 'question' | 'review' | 'results';

// Parse a reference string and return a link if possible
function parseReference(reference: string): { text: string; link: string | null } {
  const aimMatch = reference.match(/AIM\s+(\d+)-(\d+)-(\d+)/i);
  if (aimMatch) {
    const chapter = aimMatch[1];
    const section = `${aimMatch[1]}-${aimMatch[2]}-${aimMatch[3]}`;
    return { text: reference, link: `/aim/${chapter}#${section}` };
  }

  const aimChapterMatch = reference.match(/AIM\s+Chapter\s+(\d+)/i);
  if (aimChapterMatch) {
    return { text: reference, link: `/aim/${aimChapterMatch[1]}` };
  }

  const cfrMatch = reference.match(/(?:14|49)\s*CFR\s*(?:Part\s*)?(\d+)(?:\.(\d+))?/i);
  if (cfrMatch) {
    const part = cfrMatch[1];
    const section = cfrMatch[2] ? `${part}.${cfrMatch[2]}` : null;
    return { text: reference, link: `/far/${part}${section ? `#${section}` : ''}` };
  }

  const partMatch = reference.match(/Part\s+(\d+)/i);
  if (partMatch) {
    return { text: reference, link: `/far/${partMatch[1]}` };
  }

  return { text: reference, link: null };
}

function ReferenceLink({ reference }: { reference: string }) {
  const { text, link } = parseReference(reference);

  if (link) {
    return (
      <Link
        to={link}
        className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:underline"
      >
        {text}
        <ExternalLink className="w-3 h-3" />
      </Link>
    );
  }

  return <span>{text}</span>;
}

interface Answer {
  questionId: string;
  selectedAnswer: number;
  isCorrect: boolean;
}

export function QuizPage() {
  const { quizId } = useParams();
  const quizMeta = quizId ? getQuizMetadata(quizId) : undefined;
  const [quiz, setQuiz] = useState<Quiz>();
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const activeQuizId = useRef<string | undefined>(quizId);

  const [state, setState] = useState<QuizState>('intro');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [shuffledQuestions, setShuffledQuestions] = useState<QuizQuestion[]>([]);

  useEffect(() => {
    activeQuizId.current = quizId;
    setQuiz(undefined);
    setIsLoading(false);
    setLoadError(false);
    setState('intro');
    setCurrentIndex(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setShuffledQuestions([]);

    return () => {
      activeQuizId.current = undefined;
    };
  }, [quizId]);

  if (!quizMeta) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">Quiz not found</h1>
        <Button variant="link" asChild>
          <Link to="/quizzes">Return to quizzes</Link>
        </Button>
      </div>
    );
  }

  const currentQuestion = shuffledQuestions[currentIndex];
  const score = answers.filter((a) => a.isCorrect).length;
  const percentage = Math.round((score / Math.max(shuffledQuestions.length, 1)) * 100);
  const passed = percentage >= quizMeta.passingScore;

  const handleSelectAnswer = (answerIndex: number) => {
    if (showExplanation) return;
    setSelectedAnswer(answerIndex);
    const isCorrect = answerIndex === currentQuestion.correctAnswer;
    setAnswers([
      ...answers,
      { questionId: currentQuestion.id, selectedAnswer: answerIndex, isCorrect },
    ]);
    setShowExplanation(true);
  };

  const handleNextQuestion = () => {
    if (currentIndex < shuffledQuestions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      setState('results');
    }
  };

  const handleRestart = () => {
    if (!quiz) return;
    setCurrentIndex(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setShowExplanation(false);
    const shuffled = [...quiz.questions].sort(() => Math.random() - 0.5);
    setShuffledQuestions(shuffled);
    setState('intro');
  };

  const startQuiz = (loadedQuiz: Quiz) => {
    setQuiz(loadedQuiz);
    setShuffledQuestions([...loadedQuiz.questions].sort(() => Math.random() - 0.5));
    setCurrentIndex(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setState('question');
  };

  const handleStartQuiz = async () => {
    if (!quizId || isLoading) return;
    setLoadError(false);
    if (quiz) {
      startQuiz(quiz);
      return;
    }

    const requestedQuizId = quizId;
    setIsLoading(true);
    try {
      const loadedQuiz = await getQuiz(requestedQuizId);
      if (activeQuizId.current !== requestedQuizId) return;
      if (!loadedQuiz) {
        setLoadError(true);
        return;
      }
      startQuiz(loadedQuiz);
    } catch {
      if (activeQuizId.current === requestedQuizId) setLoadError(true);
    } finally {
      if (activeQuizId.current === requestedQuizId) setIsLoading(false);
    }
  };

  // Intro Screen
  if (state === 'intro') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 animate-fade-in">
        <Helmet>
          <title>{`${quizMeta.title} | FAR/AIM Online`}</title>
          <meta name="description" content={quizMeta.description} />
        </Helmet>

        <Breadcrumbs items={[
          { label: 'Quizzes', path: '/quizzes' },
          { label: quizMeta.title },
        ]} />

        <Card className="rounded-2xl shadow-lg mt-6">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-10 h-10 text-white" />
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-2">{quizMeta.title}</h1>
            <p className="text-muted-foreground mb-6">{quizMeta.description}</p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { value: quizMeta.questionCount, label: 'Questions' },
                { value: `${quizMeta.passingScore}%`, label: 'Passing Score' },
                { value: `~${Math.ceil(quizMeta.questionCount * 1.5)}m`, label: 'Est. Time' },
              ].map((stat) => (
                <div key={stat.label} className="bg-muted/50/50 rounded-xl p-4">
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>

            <Button
              onClick={() => void handleStartQuiz()}
              disabled={isLoading}
              className="w-full py-6 text-base bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 rounded-xl"
            >
              {isLoading ? 'Loading quiz…' : loadError ? 'Try Again' : 'Start Quiz'}
            </Button>
            {loadError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                We couldn’t load this quiz. Check your connection and try again.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Results Screen
  if (state === 'results') {
    return (
      <>
        <Helmet>
          <title>{`Results — ${quizMeta.title} | FAR/AIM Online`}</title>
        </Helmet>
        <AirplaneCelebration show={passed} />

        <div className="max-w-2xl mx-auto px-4 py-8 animate-fade-in">
          <Card className={`rounded-2xl shadow-lg relative overflow-hidden ${passed ? 'ring-2 ring-emerald-500/50' : ''}`}>
            {passed && (
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-sky-500/5 animate-pulse" />
            )}
            <CardContent className="p-8 text-center relative z-10">
              <div className={`w-20 h-20 ${passed ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 animate-bounce shadow-emerald-500/30' : 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/30'} rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg`}>
                <Trophy className={`w-10 h-10 text-white ${passed ? 'animate-pulse' : ''}`} />
              </div>

              <h1 className={`text-2xl font-bold mb-2 ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                {passed ? '🎉 Congratulations, Pilot! 🎉' : 'Keep Practicing!'}
              </h1>
              <p className="text-muted-foreground mb-6">
                {passed
                  ? 'You passed the quiz! You\'re cleared for takeoff! ✈️'
                  : `You need ${quizMeta.passingScore}% to pass. Review the material and try again.`}
              </p>

              <div className={`text-6xl font-bold mb-2 ${passed ? 'animate-scale-in' : ''}`}>
                <span className={passed ? 'text-emerald-500 drop-shadow-lg' : 'text-amber-500'}>
                  {percentage}%
                </span>
              </div>
              <div className="text-muted-foreground mb-8">
                {score} of {shuffledQuestions.length} correct
                {passed && <span className="ml-2">🏆</span>}
              </div>

              <Progress
                value={percentage}
                className="h-3 mb-8"
                indicatorClassName={passed ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-amber-500'}
              />

              {passed && (
                <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/10 to-sky-500/10 rounded-full border border-emerald-500/20">
                  <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                  </svg>
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    Practice Goal Met
                  </span>
                </div>
              )}

              <div className="flex gap-4">
                <Button
                  variant="secondary"
                  onClick={() => setState('review')}
                  className="flex-1 py-6 rounded-xl"
                >
                  Review Answers
                </Button>
                <Button
                  onClick={handleRestart}
                  className={`flex-1 py-6 rounded-xl ${passed ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-500/25 hover:shadow-emerald-500/40' : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 shadow-purple-500/25 hover:shadow-purple-500/40'} shadow-lg`}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {passed ? 'Fly Again' : 'Try Again'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // Review Screen
  if (state === 'review') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
        <Helmet>
          <title>{`Review — ${quizMeta.title} | FAR/AIM Online`}</title>
        </Helmet>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Review Answers</h1>
          <Button variant="link" onClick={() => setState('results')}>
            Back to Results
          </Button>
        </div>

        <div className="space-y-6">
          {shuffledQuestions.map((question, index) => {
            const answer = answers[index];
            const isCorrect = answer?.isCorrect;

            return (
              <Card
                key={question.id}
                className={`rounded-xl ${isCorrect
                  ? 'border-emerald-200 dark:border-emerald-800'
                  : 'border-red-200 dark:border-red-800'
                  }`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isCorrect
                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400'
                        : 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400'
                        }`}
                    >
                      {isCorrect ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Question {index + 1}</span>
                      <p className="text-foreground font-medium">{question.question}</p>
                    </div>
                  </div>

                  <div className="space-y-2 ml-11 mb-4">
                    {question.options.map((option, optionIndex) => {
                      const isSelected = answer?.selectedAnswer === optionIndex;
                      const isCorrectAnswer = question.correctAnswer === optionIndex;

                      return (
                        <div
                          key={optionIndex}
                          className={`p-3 rounded-lg text-sm ${isCorrectAnswer
                            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : isSelected
                              ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                              : 'bg-muted/50/50 text-muted-foreground'
                            }`}
                        >
                          {option}
                          {isCorrectAnswer && (
                            <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium">(Correct)</span>
                          )}
                          {isSelected && !isCorrectAnswer && (
                            <span className="ml-2 text-red-600 dark:text-red-400 font-medium">(Your answer)</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="ml-11 bg-muted/50/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-2">{question.explanation}</p>
                    <p className="text-xs text-muted-foreground">
                      Reference: <ReferenceLink reference={question.reference} />
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            onClick={handleRestart}
            className="py-6 px-8 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 shadow-lg hover:shadow-purple-500/40"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Start Over
          </Button>
        </div>
      </div>
    );
  }

  // Question Screen
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 animate-fade-in">
      <Helmet>
        <title>{`Question ${currentIndex + 1} — ${quizMeta.title} | FAR/AIM Online`}</title>
      </Helmet>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>Question {currentIndex + 1} of {shuffledQuestions.length}</span>
          <span>{Math.round(((currentIndex + 1) / shuffledQuestions.length) * 100)}%</span>
        </div>
        <Progress
          value={currentIndex + 1}
          max={shuffledQuestions.length}
          indicatorClassName="bg-purple-500"
        />
      </div>

      {/* Question Card */}
      <Card className="rounded-2xl shadow-lg">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold text-foreground mb-6">
            {currentQuestion.question}
          </h2>

          {/* Options */}
          <div className="space-y-3 mb-6">
            {currentQuestion.options.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const isCorrect = index === currentQuestion.correctAnswer;
              const showResult = showExplanation;

              let optionClass = 'w-full p-4 text-left rounded-xl border-2 transition-all ';
              if (showResult) {
                if (isCorrect) {
                  optionClass += 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-500 text-emerald-700 dark:text-emerald-300';
                } else if (isSelected && !isCorrect) {
                  optionClass += 'bg-red-50 dark:bg-red-900/30 border-red-500 text-red-700 dark:text-red-300';
                } else {
                  optionClass += 'bg-muted/50/50 border-border text-muted-foreground opacity-60';
                }
              } else {
                optionClass += 'bg-card border-border text-foreground/70 hover:border-purple-300 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer';
              }

              return (
                <button
                  key={index}
                  onClick={() => handleSelectAnswer(index)}
                  disabled={showExplanation}
                  className={optionClass}
                >
                  <span className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${showResult && isCorrect
                      ? 'bg-emerald-500 text-white'
                      : showResult && isSelected && !isCorrect
                        ? 'bg-red-500 text-white'
                        : 'bg-muted'
                      }`}>
                      {showResult && isCorrect ? (
                        <Check className="w-4 h-4" />
                      ) : showResult && isSelected && !isCorrect ? (
                        <X className="w-4 h-4" />
                      ) : (
                        String.fromCharCode(65 + index)
                      )}
                    </span>
                    <span className="flex-1">{option}</span>
                    {showResult && isCorrect && (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Correct</span>
                    )}
                    {showResult && isSelected && !isCorrect && (
                      <span className="text-xs font-medium text-red-600 dark:text-red-400">Your answer</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Explanation */}
          {showExplanation && (
            <div className="bg-muted/50/50 rounded-xl p-4 mb-6 animate-slide-up">
              <h3 className="font-semibold text-foreground mb-2">Explanation</h3>
              <p className="text-sm text-muted-foreground mb-2">{currentQuestion.explanation}</p>
              <p className="text-xs text-muted-foreground">
                Reference: <ReferenceLink reference={currentQuestion.reference} />
              </p>
            </div>
          )}

          {/* Next Question */}
          {showExplanation && (
            <Button
              onClick={handleNextQuestion}
              className="w-full py-6 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 shadow-lg hover:shadow-purple-500/40"
            >
              {currentIndex < shuffledQuestions.length - 1 ? (
                <>
                  Next Question
                  <ChevronRight className="w-5 h-5 ml-2" />
                </>
              ) : (
                'See Results'
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
