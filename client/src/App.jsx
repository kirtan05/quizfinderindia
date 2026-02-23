import { useState, useEffect, useCallback } from 'react';
import { fetchQuizzes } from './utils/api';
import QuizGrid from './components/QuizGrid';
import QuizDetail from './components/QuizDetail';
import Filters from './components/Filters';
import AdminLogin from './components/AdminLogin';
import AdminPanel from './components/AdminPanel';
import './App.css';

/* ---- Hash Router ---- */
function parseHash() {
  const hash = window.location.hash || '#/';
  if (hash.startsWith('#/quiz/')) {
    const id = hash.slice(7);
    return { route: 'detail', id };
  }
  if (hash.startsWith('#/admin')) {
    return { route: 'admin' };
  }
  return { route: 'home' };
}

function navigate(path) {
  window.location.hash = path;
}

/* ---- Default filters ---- */
const DEFAULT_FILTERS = {
  search: '',
  org: '',
  eligibility: [],
  upcoming: true,
};

export default function App() {
  // Routing
  const [routeState, setRouteState] = useState(parseHash);

  useEffect(() => {
    function onHashChange() {
      setRouteState(parseHash());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Quiz list state
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });

  // Admin auth
  const [adminAuthed, setAdminAuthed] = useState(
    () => !!localStorage.getItem('dqc_admin_token')
  );

  // Fetch quizzes when filters change (only on home route, but we keep data warm)
  const loadQuizzes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        upcoming: filters.upcoming,
      };
      if (filters.search) params.search = filters.search;
      if (filters.org) params.org = filters.org;
      if (filters.eligibility.length > 0) {
        params.eligibility = filters.eligibility.join(',');
      }
      const data = await fetchQuizzes(params);
      setQuizzes(data);
    } catch {
      setQuizzes([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  function handleSelectQuiz(id) {
    navigate(`/quiz/${id}`);
  }

  function handleBackToGrid() {
    navigate('/');
  }

  function handleFilterChange(next) {
    setFilters(next);
  }

  function handleClearFilters() {
    setFilters({ ...DEFAULT_FILTERS });
  }

  function handleAdminLogin() {
    setAdminAuthed(true);
  }

  function handleAdminLogout() {
    localStorage.removeItem('dqc_admin_token');
    setAdminAuthed(false);
  }

  // Render page based on route
  let page;
  if (routeState.route === 'detail') {
    page = (
      <QuizDetail quizId={routeState.id} onBack={handleBackToGrid} />
    );
  } else if (routeState.route === 'admin') {
    page = adminAuthed ? (
      <AdminPanel onLogout={handleAdminLogout} />
    ) : (
      <AdminLogin onLogin={handleAdminLogin} />
    );
  } else {
    page = (
      <div className="home-layout">
        <Filters
          filters={filters}
          onFilterChange={handleFilterChange}
          onClear={handleClearFilters}
        />
        <main className="home-layout__main">
          <QuizGrid
            quizzes={quizzes}
            loading={loading}
            onSelectQuiz={handleSelectQuiz}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <a href="#/" className="app-header__brand" onClick={() => navigate('/')}>
          <span className="app-header__logo" aria-hidden="true">[?]</span>
          <span className="app-header__title">DQC Quiz Board</span>
        </a>
        <nav className="app-header__nav">
          <a
            href="#/"
            className={`app-header__link ${routeState.route === 'home' ? 'app-header__link--active' : ''}`}
          >
            Quizzes
          </a>
          <a
            href="#/admin"
            className={`app-header__link ${routeState.route === 'admin' ? 'app-header__link--active' : ''}`}
          >
            Admin
          </a>
        </nav>
      </header>

      <div className="app-content">
        {page}
      </div>
    </div>
  );
}
