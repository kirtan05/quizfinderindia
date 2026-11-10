import { useEffect } from 'react';

// Storage can throw (blocked cookies, some in-app browsers); then nothing is remembered
export const store = {
  get: key => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => {
    try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* not remembered */ }
  },
};

// A sheet that the phone's Back button closes: opening pushes a history entry, closing by
// any other means steps back over it
export function useBackClose(open, close) {
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ sheet: true }, '');
    window.addEventListener('popstate', close);
    return () => {
      window.removeEventListener('popstate', close);
      if (window.history.state?.sheet) window.history.back();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}
