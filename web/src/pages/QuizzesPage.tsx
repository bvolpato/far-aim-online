import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Brain, Clock, Target, ChevronRight, BookOpen, Scale, Sparkles, Feather, TrendingUp, Flame } from 'lucide-react';
import { getQuizzesByCategory, type QuizMeta } from '../data/catalog';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';

function DifficultyBadge({ level }: { level: string }) {
  const normalized = level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();

  let colorClass = 'bg-muted text-muted-foreground';
  let Icon = Target;

  if (normalized === 'Easy') {
    colorClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    Icon = Feather;
  } else if (normalized === 'Medium' || normalized === 'Intermediate') {
    colorClass = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    Icon = TrendingUp;
  } else if (normalized === 'Hard') {
    colorClass = 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
    Icon = Flame;
  }

  return (
    <Badge variant="outline" className={`gap-1.5 border-transparent ${colorClass}`}>
      <Icon className="w-3.5 h-3.5" />
      {normalized}
    </Badge>
  );
}

function QuizCard({ quiz }: { quiz: QuizMeta }) {
  return (
    <Link to={`/quizzes/${quiz.id}`} className="group">
      <Card className="rounded-2xl hover:shadow-xl transition-all card-hover h-full">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Brain className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {quiz.chapter && (
                  <Badge variant="aim">Chapter {quiz.chapter}</Badge>
                )}
                <DifficultyBadge level={quiz.difficulty} />
              </div>
              <h2 className="text-xl font-semibold text-foreground group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors mb-2">
                {quiz.title}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {quiz.description}
              </p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Target className="w-4 h-4" />
                  <span>{quiz.questionCount} questions</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>~{Math.ceil(quiz.questionCount * 1.5)} min</span>
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-purple-500 transition-colors mt-2" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function QuizzesPage() {
  const { misc, aim, far } = getQuizzesByCategory();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      <Helmet>
        <title>Practice Quizzes | FAR/AIM Online</title>
        <meta name="description" content="Test your knowledge of FAR/AIM with practice quizzes covering all aviation regulations and procedures." />
      </Helmet>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Practice Quizzes
        </h1>
        <p className="text-muted-foreground">
          Test your knowledge of FAR/AIM with these practice quizzes
        </p>
      </div>

      {/* Miscellaneous Quizzes Section */}
      {misc.length > 0 && (
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Miscellaneous</h2>
              <p className="text-sm text-muted-foreground">
                {misc.length} {misc.length === 1 ? 'quiz' : 'quizzes'} for fun and practice
              </p>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {misc.map((quiz) => (
              <QuizCard key={quiz.id} quiz={quiz} />
            ))}
          </div>
        </div>
      )}

      {/* AIM Quizzes Section */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              Aeronautical Information Manual (AIM)
            </h2>
            <p className="text-sm text-muted-foreground">
              {aim.length} quizzes covering all AIM chapters
            </p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {aim.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} />
          ))}
        </div>
      </div>

      {/* FAR Quizzes Section */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              Federal Aviation Regulations (FAR)
            </h2>
            <p className="text-sm text-muted-foreground">
              {far.length} quizzes covering key FAR topics
            </p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {far.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} />
          ))}
        </div>
      </div>

      {/* Quiz Tips */}
      <Card className="mt-12 rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 dark:from-purple-500/20 dark:to-purple-600/10 border-purple-200 dark:border-purple-800/50">
        <CardContent className="p-8">
          <h2 className="text-xl font-bold text-foreground mb-4">Quiz Tips</h2>
          <ul className="space-y-3">
            {[
              'Read each question carefully before selecting an answer',
              'Review the explanation after each answer to reinforce learning',
              'Note the references to study specific regulations further',
              'Aim for the passing score of 70% to simulate FAA standards',
            ].map((tip, index) => (
              <li key={index} className="flex items-start gap-3 text-muted-foreground">
                <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">
                  {index + 1}
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
