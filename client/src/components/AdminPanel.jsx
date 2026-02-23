import { useState, useEffect, useCallback } from 'react';
import {
  fetchAllQuizzes,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  publishQuiz,
  triggerSync,
  fetchSyncStatus,
  reconnectWhatsApp,
  AuthError,
} from '../utils/api';
import QuizEditor from './QuizEditor';

function statusBadge(quiz) {
  if (quiz.status === 'flagged') return 'flagged';
  if (quiz.status === 'draft') return 'draft';
  return 'published';
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function WaStatusDot({ status }) {
  let colorClass = 'wa-status--unknown';
  let label = 'Unknown';

  if (status) {
    if (status.loggedOut) {
      colorClass = 'wa-status--disconnected';
      label = 'Logged out';
    } else if (status.connected) {
      colorClass = 'wa-status--connected';
      label = 'Connected';
    } else {
      colorClass = 'wa-status--unknown';
      label = 'Disconnected';
    }
  }

  return (
    <span className={`wa-status ${colorClass}`} title={`WhatsApp: ${label}`}>
      <span className="wa-status__dot" />
      <span className="wa-status__label">{label}</span>
    </span>
  );
}

export default function AdminPanel({ onLogout }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | quiz object
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [waStatus, setWaStatus] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectMsg, setReconnectMsg] = useState(null);

  function handleAuthError(err) {
    if (err instanceof AuthError || err.name === 'AuthError') {
      onLogout();
      return true;
    }
    return false;
  }

  const loadStatus = useCallback(async () => {
    try {
      const status = await fetchSyncStatus();
      setWaStatus(status);
    } catch (err) {
      if (!handleAuthError(err)) {
        setWaStatus(null);
      }
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAllQuizzes();
      setQuizzes(data);
      setError(null);
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); loadStatus(); }, [load, loadStatus]);

  async function handleSave(payload) {
    setSaving(true);
    try {
      if (editing === 'new') {
        await createQuiz(payload);
      } else {
        await updateQuiz(editing.id, payload);
      }
      setEditing(null);
      await load();
    } catch (err) {
      if (!handleAuthError(err)) {
        alert('Save failed: ' + err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteQuiz(id);
      setDeleteConfirm(null);
      await load();
    } catch (err) {
      if (!handleAuthError(err)) {
        alert('Delete failed: ' + err.message);
      }
    }
  }

  async function handlePublish(id) {
    try {
      await publishQuiz(id);
      await load();
    } catch (err) {
      if (!handleAuthError(err)) {
        alert('Publish failed: ' + err.message);
      }
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await triggerSync();
      await load();
      await loadStatus();
    } catch (err) {
      if (!handleAuthError(err)) {
        alert('Sync failed: ' + err.message);
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleReconnect() {
    setReconnecting(true);
    setReconnectMsg(null);
    try {
      const result = await reconnectWhatsApp();
      setReconnectMsg(result.message);
      await loadStatus();
    } catch (err) {
      if (!handleAuthError(err)) {
        alert('Reconnect failed: ' + err.message);
      }
    } finally {
      setReconnecting(false);
    }
  }

  // If editing, show editor
  if (editing) {
    return (
      <div className="admin-panel">
        <QuizEditor
          quiz={editing === 'new' ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel__header">
        <h2 className="admin-panel__title">// Admin Panel</h2>
        <div className="admin-panel__actions">
          <button className="btn btn--primary" onClick={() => setEditing('new')}>
            + Add Quiz
          </button>
          <button
            className="btn btn--secondary"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : 'Trigger Sync'}
          </button>
          <button className="btn btn--ghost" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="admin-panel__wa-bar">
        <WaStatusDot status={waStatus} />
        {waStatus?.lastSync && (
          <span className="wa-status__last-sync">
            Last sync: {new Date(waStatus.lastSync).toLocaleString()}
          </span>
        )}
        {waStatus?.error && (
          <span className="wa-status__error">{waStatus.error}</span>
        )}
        <button
          className="btn btn--sm btn--secondary"
          onClick={handleReconnect}
          disabled={reconnecting}
        >
          {reconnecting ? 'Reconnecting...' : 'Reconnect WhatsApp'}
        </button>
      </div>

      {reconnectMsg && (
        <div className="admin-panel__reconnect-msg">
          {reconnectMsg}
        </div>
      )}

      {error && <p className="admin-panel__error">{error}</p>}

      {loading ? (
        <div className="quiz-grid__state">
          <div className="loader">
            <span className="loader__bar" />
            <span className="loader__bar" />
            <span className="loader__bar" />
          </div>
          <p>Loading quizzes...</p>
        </div>
      ) : quizzes.length === 0 ? (
        <p className="admin-panel__empty">No quizzes yet. Add one or trigger a sync.</p>
      ) : (
        <div className="admin-panel__table-wrap">
          <table className="admin-panel__table">
            <thead>
              <tr>
                <th>Quiz</th>
                <th>Date</th>
                <th>Org</th>
                <th>Status</th>
                <th>Conf.</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {quizzes.map(q => (
                <tr
                  key={q.id}
                  className={
                    q.status === 'flagged' ? 'admin-panel__row--flagged' : ''
                  }
                >
                  <td className="admin-panel__cell--name">{q.name || '(untitled)'}</td>
                  <td>{formatDate(q.date)}</td>
                  <td>{q.hostingOrg || '--'}</td>
                  <td>
                    <span className={`status-badge status-badge--${statusBadge(q)}`}>
                      {q.status || 'published'}
                    </span>
                  </td>
                  <td className="admin-panel__cell--conf">
                    {q.confidence != null
                      ? `${Math.round(q.confidence * 100)}%`
                      : '--'}
                  </td>
                  <td className="admin-panel__cell--actions">
                    <button
                      className="btn btn--sm btn--secondary"
                      onClick={() => setEditing(q)}
                    >
                      Edit
                    </button>
                    {q.status === 'flagged' && (
                      <button
                        className="btn btn--sm btn--primary"
                        onClick={() => handlePublish(q.id)}
                      >
                        Publish
                      </button>
                    )}
                    {deleteConfirm === q.id ? (
                      <>
                        <button
                          className="btn btn--sm btn--danger"
                          onClick={() => handleDelete(q.id)}
                        >
                          Confirm
                        </button>
                        <button
                          className="btn btn--sm btn--ghost"
                          onClick={() => setDeleteConfirm(null)}
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn--sm btn--danger"
                        onClick={() => setDeleteConfirm(q.id)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
