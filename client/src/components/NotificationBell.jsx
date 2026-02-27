import { useState, useEffect } from 'react';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const ELIGIBILITY_OPTIONS = ['Open', 'U18', 'U23', 'U25', 'U30', 'UG', 'PG'];

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export default function NotificationBell({ cities }) {
  const [subscribed, setSubscribed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedCities, setSelectedCities] = useState([]);
  const [selectedEligibility, setSelectedEligibility] = useState([]);
  const [busy, setBusy] = useState(false);

  // Don't render if VAPID key is not configured
  if (!VAPID_PUBLIC_KEY) return null;

  // Check existing subscription on mount
  useEffect(() => {
    const saved = localStorage.getItem('qf_notif_prefs');
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

  function toggleCity(city) {
    setSelectedCities(prev =>
      prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]
    );
  }

  function toggleEligibility(tag) {
    setSelectedEligibility(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }

  async function handleSubscribe() {
    if (selectedCities.length === 0) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const prefs = {
        cities: selectedCities,
        eligibility: selectedEligibility,
      };

      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), prefs }),
      });

      localStorage.setItem('qf_notif_prefs', JSON.stringify(prefs));
      setSubscribed(true);
      setShowModal(false);
    } catch (err) {
      console.error('Push subscription failed:', err);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      localStorage.removeItem('qf_notif_prefs');
      setSubscribed(false);
      setSelectedCities([]);
      setSelectedEligibility([]);
    } catch (err) {
      console.error('Unsubscribe failed:', err);
    } finally {
      setBusy(false);
    }
  }

  function handleBellClick() {
    if (subscribed) {
      handleUnsubscribe();
    } else {
      setShowModal(true);
    }
  }

  return (
    <>
      <button
        className="notif-bell"
        onClick={handleBellClick}
        disabled={busy}
        title={subscribed ? 'Unsubscribe from notifications' : 'Subscribe to notifications'}
        aria-label={subscribed ? 'Unsubscribe from notifications' : 'Subscribe to notifications'}
      >
        {subscribed ? '\uD83D\uDD14' : '\uD83D\uDD15'}
      </button>

      {showModal && (
        <div className="notif-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="notif-modal" onClick={e => e.stopPropagation()}>
            <h3 className="notif-modal__title">Quiz Notifications</h3>
            <p className="notif-modal__desc">
              Get notified when new quizzes are posted for your cities.
            </p>

            <div className="notif-modal__section">
              <span className="notif-modal__label">Cities</span>
              <div className="notif-modal__chips">
                {(cities || []).map(city => (
                  <button
                    key={city}
                    className={`notif-chip${selectedCities.includes(city) ? ' notif-chip--selected' : ''}`}
                    onClick={() => toggleCity(city)}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>

            <div className="notif-modal__section">
              <span className="notif-modal__label">Eligibility</span>
              <div className="notif-modal__chips">
                {ELIGIBILITY_OPTIONS.map(tag => (
                  <button
                    key={tag}
                    className={`notif-chip${selectedEligibility.includes(tag) ? ' notif-chip--selected' : ''}`}
                    onClick={() => toggleEligibility(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="notif-modal__actions">
              <button className="notif-modal__cancel" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className="notif-modal__subscribe"
                onClick={handleSubscribe}
                disabled={busy || selectedCities.length === 0}
              >
                {busy ? 'Subscribing...' : 'Subscribe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
