import { useState } from 'react';
import { store } from '../utils/browser';
import AdminLogin from './AdminLogin';
import AdminPanel from './AdminPanel';

export default function AdminRoute() {
  const [authed, setAuthed] = useState(() => !!store.get('dqc_admin_token'));
  return authed
    ? <AdminPanel onLogout={() => { store.set('dqc_admin_token', null); setAuthed(false); }} />
    : <AdminLogin onLogin={() => setAuthed(true)} />;
}
