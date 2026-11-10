import { useState, useEffect, lazy, Suspense } from 'react';
import { fetchQuizzes, fetchPast, fetchGroupNames, isUpcoming, SITE_ORIGIN } from './utils/api';
import { groupByWhen, isOnline, matchesFilters, timeAgo } from './utils/quiz';
import QuizCard from './components/QuizCard';
import QuizDetail from './components/QuizDetail';
import Filters from './components/Filters';
import CityIndex from './components/CityIndex';
import Tally from './components/Tally';
import Icon from './components/Icon';
import Link from './components/Link';
import { store, useBackClose } from './utils/browser';
import NotificationBell from './components/NotificationBell';
import './App.css';

// The admin screens need the local backend, so they are not part of the built site
const AdminRoute = import.meta.env.DEV ? lazy(() => import('./components/AdminRoute')) : null;

// Old links used hash routes (#/quiz/<id>, #/admin); move them to real paths
if (/^#\/(quiz\/|admin)/.test(window.location.hash)) {
  window.history.replaceState(null, '', window.location.hash.slice(1));
}

function parsePath() {
  const path = window.location.pathname;
  if (path.startsWith('/quiz/')) return { route: 'detail', id: decodeURIComponent(path.slice(6).replace(/\/$/, '')) };
  if (AdminRoute && path.startsWith('/admin')) return { route: 'admin' };
  return { route: 'home' };
}

const ALL = 'all'; // the remembered "city" for the whole country
const DEFAULT_FILTERS = { search: '', when: '', eligibility: [], team: '', free: false, past: false };
const SUBMIT_URL = `https://github.com/kirtan05/quizfinderindia/issues/new?title=${encodeURIComponent('Quiz submission')}`;
const plural = n => `${n} ${n === 1 ? 'quiz' : 'quizzes'}`;

// One subscription that keeps itself up to date, instead of adding quizzes one by one
function CalendarFeed({ city }) {
  const slug = city === ALL ? ALL : city.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const feed = `${SITE_ORIGIN.replace('https', 'webcal')}/cal/${slug}.ics`;
  return (
    <details className="feed">
      <summary><Icon name="calendar" />Add all {city !== ALL && `${city} `}quizzes to my calendar</summary>
      <p>Subscribe once and new quizzes turn up in your calendar as they are announced.</p>
      <a className="btn" href={feed}>Apple, Outlook or phone calendar</a>
      <a className="btn" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}`}
        target="_blank" rel="noopener noreferrer">Google Calendar</a>
    </details>
  );
}

export default function App() {
  const [routeState, setRouteState] = useState(parsePath);
  useEffect(() => {
    const onPopState = () => setRouteState(parsePath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [quizzes, setQuizzes] = useState(null); // null while loading
  const [failed, setFailed] = useState(false);
  const [past, setPast] = useState(null); // null until someone asks for past quizzes
  const [groupNames, setGroupNames] = useState({});
  useEffect(() => {
    fetchGroupNames().then(setGroupNames).catch(() => {});
  }, []);
  useEffect(() => {
    if (!failed) fetchQuizzes().then(setQuizzes).catch(() => setFailed(true));
  }, [failed]);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  // '' until the visitor has chosen; an earlier version of the site could store 'Online'
  const [city, setCity] = useState(() => (store.get('qfb_city') || '').replace(/^Online$/, ''));
  const [choosing, setChoosing] = useState(false);
  useBackClose(choosing, () => setChoosing(false));

  const { route, id } = routeState;
  const wantPast = !!quizzes && !past && (filters.past || (route === 'detail' && !quizzes.some(q => q.id === id)));
  useEffect(() => {
    if (wantPast) fetchPast().then(setPast);
  }, [wantPast]);

  function chooseCity(value) {
    setCity(value);
    setChoosing(false);
    store.set('qfb_city', value);
    window.scrollTo(0, 0);
  }

  const all = [...(quizzes || []), ...(past || [])];
  const upcoming = all.filter(isUpcoming);
  const online = upcoming.filter(isOnline).length;

  // Only cities with something upcoming, busiest first. Online-only quizzes have no city of their own.
  const counts = {};
  for (const q of upcoming) if (q.city && q.city !== 'Online') counts[q.city] = (counts[q.city] || 0) + 1;
  const cities = Object.entries(counts).sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  const cityIndex = <CityIndex cities={cities} total={upcoming.length} current={city} onPick={chooseCity} />;

  let page;
  if (failed) {
    page = (
      <main className="state">
        <p>The quizzes could not be loaded. Check your connection and try again.</p>
        <button type="button" className="btn" onClick={() => setFailed(false)}>Retry</button>
      </main>
    );
  } else if (route === 'detail') {
    page = (
      <QuizDetail
        quiz={all.find(q => q.id === id)}
        loading={!quizzes || wantPast}
        groupNames={groupNames}
        home={city && city !== ALL ? `Quizzes in ${city}` : 'All quizzes'}
      />
    );
  } else if (route === 'admin') {
    page = <Suspense fallback={null}><AdminRoute /></Suspense>;
  } else if (!quizzes) {
    page = <main className="state"><p>Loading quizzes…</p></main>;
  } else if (!city || choosing) {
    page = (
      <main className="opening">
        <div>
          <h1>Where do you quiz?</h1>
          <p className="opening__lede">
            {plural(upcoming.length)} coming up, gathered from the WhatsApp groups and Instagram pages of quiz clubs,
            colleges and pub quiz hosts across India. Pick your city to see what is on.
          </p>
        </div>
        <div>
          {cityIndex}
          <p className="hand">No negatives for a wrong answer: you can change city whenever you like.</p>
          {online > 0 && <p className="opening__note">The {plural(online)} played online {online === 1 ? 'is' : 'are'} listed under every city.</p>}
        </div>
      </main>
    );
  } else {
    // Online quizzes are open to everyone, so every city's list carries them
    const inCity = all.filter(q => (city === ALL || q.city === city || isOnline(q)) && (filters.past || isUpcoming(q)));
    const shown = inCity.filter(q => matchesFilters(q, filters));
    const nothingHere = city !== ALL && !counts[city];
    const updated = all.reduce((max, q) => (q.createdAt > max ? q.createdAt : max), '');
    page = (
      <main>
        <div className="list-head">
          <h1>
            Quizzes {city === ALL ? 'across' : 'in'}{' '}
            <button type="button" className="city-switch" onClick={() => setChoosing(true)}>
              {city === ALL ? 'India' : city}<span>Change</span>
            </button>
          </h1>
          <Filters filters={filters} defaults={DEFAULT_FILTERS} onChange={setFilters} quizzes={inCity} count={shown.length} />
        </div>

        {upcoming.some(q => q.date && (city === ALL || q.city === city)) && <CalendarFeed city={city} />}

        {nothingHere && (
          <div className="notice">
            <p>
              Nothing has been announced in {city} yet.
              {online > 0 ? ' The online quizzes below are open to you, or try another city.' : ' Try another city.'}
            </p>
            {cityIndex}
          </div>
        )}
        {shown.length === 0 && !nothingHere && (
          <div className="state">
            <p className="hand">A dry round.</p>
            <p>No quizzes match what you asked for.</p>
            <button type="button" className="btn" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear search and filters</button>
          </div>
        )}

        {shown.length > 0 && (
          <div className="columns" aria-hidden="true">
            <span>Date</span><span>Quiz</span><span>Starts</span><span>Who can play</span><span>Where</span>
          </div>
        )}
        {groupByWhen(shown).map(([heading, group]) => (
          <section key={heading}>
            <h2 className={`group-heading${['Today', 'Tomorrow'].includes(heading) ? ' group-heading--soon' : ''}`}><span>{heading}</span> <Tally n={group.length} /></h2>
            <ul className="entries">
              {group.map((quiz, i) => (
                <QuizCard key={quiz.id} quiz={quiz} showCity={city === ALL}
                  sameDay={i > 0 && !!quiz.date && quiz.date === group[i - 1].date} />
              ))}
            </ul>
          </section>
        ))}

        <p className="list-foot">
          Know a quiz we missed? <a href={SUBMIT_URL} target="_blank" rel="noopener noreferrer">Tell us</a>
          {updated && <span>Last updated {timeAgo(updated)}</span>}
        </p>
      </main>
    );
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__plate">
          <Link href="/" className="masthead__brand">Quiz Finder India</Link>
          <NotificationBell cities={cities.map(([name]) => name)} />
        </div>
        <p className="masthead__dateline">
          <span>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          {quizzes && <span>{plural(upcoming.length)} ahead in {cities.length} {cities.length === 1 ? 'city' : 'cities'}</span>}
        </p>
      </header>

      {page}

      <footer className="colophon">
        Details are collected automatically from quiz club WhatsApp groups and Instagram pages and can be wrong.
        Verify with the organiser before you go.
      </footer>
    </div>
  );
}
