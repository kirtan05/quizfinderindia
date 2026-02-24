import { useState, useEffect, useCallback } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { fetchQuizzes, fetchCities } from './utils/api';
import QuizGrid from './components/QuizGrid';
import QuizDetail from './components/QuizDetail';
import Filters from './components/Filters';
import AdminLogin from './components/AdminLogin';
import AdminPanel from './components/AdminPanel';
import CityPicker from './components/CityPicker';
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
  mode: '',
  eligibility: [],
  upcoming: true,
};

function Disclaimer({ onDismiss }) {
  return (
    <div className="disclaimer">
      <p className="disclaimer__text">
        Data is aggregated from public WhatsApp groups and may be inaccurate.
        Please verify dates, timings, venues and eligibility before attending any event.
      </p>
      <button className="disclaimer__btn" onClick={onDismiss}>Got it</button>
    </div>
  );
}

export default function App() {
  // Disclaimer
  const [showDisclaimer, setShowDisclaimer] = useState(
    () => !sessionStorage.getItem('dqb_disclaimer_seen')
  );

  function dismissDisclaimer() {
    sessionStorage.setItem('dqb_disclaimer_seen', '1');
    setShowDisclaimer(false);
  }

  // City selection
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState(
    () => localStorage.getItem('qfb_city') || ''
  );
  const [showCityPicker, setShowCityPicker] = useState(false);

  useEffect(() => {
    fetchCities().then(list => {
      setCities(list);
      if (list.length === 1) {
        setSelectedCity(list[0]);
        localStorage.setItem('qfb_city', list[0]);
      } else if (!localStorage.getItem('qfb_city')) {
        setShowCityPicker(true);
      }
    }).catch(() => {});
  }, []);

  function handleCitySelect(city) {
    setSelectedCity(city);
    localStorage.setItem('qfb_city', city);
    setShowCityPicker(false);
  }

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

  // Fetch quizzes when filters or city change
  const loadQuizzes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        upcoming: filters.upcoming,
      };
      if (selectedCity) params.city = selectedCity;
      if (filters.search) params.search = filters.search;
      if (filters.org) params.org = filters.org;
      if (filters.mode) params.mode = filters.mode;
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
  }, [filters, selectedCity]);

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
      {showCityPicker && cities.length > 0 && (
        <CityPicker cities={cities} onSelect={handleCitySelect} />
      )}
      {showDisclaimer && <Disclaimer onDismiss={dismissDisclaimer} />}
      <header className="app-header">
        <a href="#/" className="app-header__brand" onClick={() => navigate('/')}>
          <span className="app-header__logo" aria-hidden="true">[?]</span>
          <span className="app-header__title">Quiz Finder</span>
          {selectedCity && (
            <button
              className="app-header__city"
              onClick={e => { e.preventDefault(); e.stopPropagation(); setShowCityPicker(true); }}
              title="Change city"
            >
              {selectedCity}
            </button>
          )}
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
      <Analytics />
    </div>
  );
}
