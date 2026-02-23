import QuizCard from './QuizCard';

export default function QuizGrid({ quizzes, loading, onSelectQuiz }) {
  if (loading) {
    return (
      <div className="quiz-grid__state">
        <div className="loader" aria-label="Loading quizzes">
          <span className="loader__bar" />
          <span className="loader__bar" />
          <span className="loader__bar" />
          <span className="loader__bar" />
          <span className="loader__bar" />
        </div>
        <p className="quiz-grid__state-text">Scanning the quizverse...</p>
      </div>
    );
  }

  if (!quizzes || quizzes.length === 0) {
    return (
      <div className="quiz-grid__state">
        <div className="quiz-grid__empty-art" aria-hidden="true">
          <pre>{`
    ___________
   |  _______  |
   | |  ???  | |
   | |_______| |
   |   __ __   |
   |  |__|__|  |
   |___________|
          `}</pre>
        </div>
        <p className="quiz-grid__state-text">
          No quizzes found in this dimension.
        </p>
        <p className="quiz-grid__state-sub">
          Try adjusting your filters, or check back later &mdash; the quiz gods are always plotting something.
        </p>
      </div>
    );
  }

  return (
    <div className="quiz-grid" role="list">
      {quizzes.map(quiz => (
        <QuizCard key={quiz.id} quiz={quiz} onClick={onSelectQuiz} />
      ))}
    </div>
  );
}
