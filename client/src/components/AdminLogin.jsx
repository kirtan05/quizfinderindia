import { useState } from 'react';
import { fetchAllQuizzes } from '../utils/api';

export default function AdminLogin({ onLogin }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!token.trim()) {
      setError('Token cannot be empty.');
      return;
    }
    setChecking(true);
    setError('');

    // Store token first so authHeaders() picks it up
    localStorage.setItem('dqc_admin_token', token.trim());

    try {
      await fetchAllQuizzes();
      onLogin();
    } catch {
      localStorage.removeItem('dqc_admin_token');
      setError('Invalid token. Access denied.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login__box">
        <h2 className="admin-login__title">// Admin Access</h2>
        <p className="admin-login__subtitle">
          Enter your admin token to proceed.
        </p>
        <form onSubmit={handleSubmit} className="admin-login__form">
          <label className="admin-login__label" htmlFor="admin-token">
            Token
          </label>
          <input
            id="admin-token"
            className="admin-login__input"
            type="password"
            placeholder="paste token here..."
            value={token}
            onChange={e => setToken(e.target.value)}
            autoFocus
          />
          {error && <p className="admin-login__error">{error}</p>}
          <button
            className="btn btn--primary"
            type="submit"
            disabled={checking}
          >
            {checking ? 'Verifying...' : 'Authenticate >>'}
          </button>
        </form>
      </div>
    </div>
  );
}
