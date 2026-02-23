import { useState, useEffect, useCallback } from 'react';
import {
  fetchAllQuizzes,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  publishQuiz,
  triggerSync,
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

export default function AdminPanel({ onLogout }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | quiz object
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAllQuizzes();
      setQuizzes(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      alert('Save failed: ' + err.message);
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
      alert('Delete failed: ' + err.message);
    }
  }

  async function handlePublish(id) {
    try {
      await publishQuiz(id);
      await load();
    } catch (err) {
      alert('Publish failed: ' + err.message);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await triggerSync();
      await load();
    } catch (err) {
      alert('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
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
