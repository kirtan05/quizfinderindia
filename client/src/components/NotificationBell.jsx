import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import { ELIGIBILITY } from '../utils/quiz';
import { store, useBackClose } from '../utils/browser';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
// iPhone Safari has no push outside an installed web app
const SUPPORTED = VAPID_PUBLIC_KEY && 'serviceWorker' in navigator && 'PushManager' in window;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export default function NotificationBell({ cities }) {
  const dialog = useRef(null);
  const [open, setOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [selectedCities, setSelectedCities] = useState([]);
  const [selectedEligibility, setSelectedEligibility] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
  }, [open]);
  useBackClose(open, () => dialog.current.close());

  // Check existing subscription on mount
  useEffect(() => {
    const saved = store.get('qf_notif_prefs');
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        setSubscribed(true);
        setSelectedCities(prefs.cities || []);
        setSelectedEligibility(prefs.eligibility || []);
      } catch {
        // ignore corrupt data
      }
    }
  }, []);

  if (!SUPPORTED) return null;

  const toggle = (setter, value) =>
    setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));

  async function run(action) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      dialog.current.close();
    } catch (err) {
      setMessage(Notification.permission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.'
        : 'That did not work. Please try again in a moment.');
      console.error('Notification change failed:', err);
    } finally {
      setBusy(false);
    }
  }

  const subscribe = () => run(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const prefs = {
      cities: selectedCities,
      eligibility: selectedEligibility,
    };

    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), preferences: prefs }),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    store.set('qf_notif_prefs', JSON.stringify(prefs));
    setSubscribed(true);
  });

  const unsubscribe = () => run(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const res = await fetch('/api/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      await sub.unsubscribe();
    }
    store.set('qf_notif_prefs', null);
    setSubscribed(false);
    setSelectedCities([]);
    setSelectedEligibility([]);
  });

  return (
    <>
      <button
        type="button"
        className="bell"
        onClick={() => { setMessage(''); setOpen(true); }}
        aria-pressed={subscribed}
        title="Notifications"
        aria-label="Notifications"
      >
        <Icon name="bell" />
      </button>

      <dialog ref={dialog} className="sheet" aria-labelledby="notif-title" onClose={() => setOpen(false)}
        onClick={e => e.target === dialog.current && dialog.current.close()}>
        <form method="dialog">
          <h2 id="notif-title" tabIndex={-1}>Tell me about new quizzes</h2>
          <p>A notification on this device when a quiz is announced in your cities.</p>

          <fieldset>
            <legend>Cities</legend>
            {(cities || []).map(city => (
              <button type="button" key={city} className="chip" aria-pressed={selectedCities.includes(city)} onClick={() => toggle(setSelectedCities, city)}>
                {city}
              </button>
            ))}
          </fieldset>

          <fieldset>
            <legend>Who can play (optional)</legend>
            {ELIGIBILITY.map(tag => (
              <button type="button" key={tag} className="chip" aria-pressed={selectedEligibility.includes(tag)} onClick={() => toggle(setSelectedEligibility, tag)}>
                {tag}
              </button>
            ))}
          </fieldset>

          {message && <p className="hand" role="alert">{message}</p>}

          <div className="sheet__actions">
            {subscribed
              ? <button type="button" className="btn" onClick={unsubscribe} disabled={busy}>Turn off notifications</button>
              : <button className="btn">Cancel</button>}
            <button type="button" className="btn btn--primary" onClick={subscribe} disabled={busy || selectedCities.length === 0}>
              {busy ? 'Saving…' : subscribed ? 'Update' : 'Subscribe'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
