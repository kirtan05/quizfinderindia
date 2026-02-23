import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchAllQuizzes,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  publishQuiz,
  triggerSync,
  fetchSyncStatus,
  reconnectWhatsApp,
  connectWhatsAppSSE,
  fetchCachedGroups,
  setWhatsAppGroup,
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

const MAX_VISIBLE_GROUPS = 50;

function GroupPicker({ groups, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [setting, setSetting] = useState(false);
  const [message, setMessage] = useState(null);

  const filtered = groups.filter(g =>
    (g.name || '').toLowerCase().includes(search.toLowerCase())
  );
  const visible = filtered.slice(0, MAX_VISIBLE_GROUPS);

  async function handleConfirm() {
    if (!selected) return;
    setSetting(true);
    try {
      await setWhatsAppGroup(selected);
      const name = groups.find(g => g.id === selected)?.name || selected;
      setMessage(`Group set to "${name}"!`);
      onSelect?.();
      setTimeout(onClose, 1200);
    } catch (err) {
      setMessage('Failed: ' + err.message);
    } finally {
      setSetting(false);
    }
  }

  return (
    <div className="wa-modal__groups">
      <input
        type="text"
        className="wa-modal__search"
        placeholder="Search groups..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />
      <span className="wa-modal__group-count">
        {filtered.length === groups.length
          ? `${groups.length} groups`
          : `${filtered.length} of ${groups.length} groups`}
        {filtered.length > MAX_VISIBLE_GROUPS && ` (showing first ${MAX_VISIBLE_GROUPS})`}
      </span>
      <div className="wa-modal__group-list">
        {visible.map(g => (
          <label
            key={g.id}
            className={`wa-modal__group-item ${selected === g.id ? 'wa-modal__group-item--selected' : ''}`}
          >
            <input
              type="radio"
              name="group"
              value={g.id}
              checked={selected === g.id}
              onChange={() => setSelected(g.id)}
            />
            <span className="wa-modal__group-name">{g.name || '(unnamed group)'}</span>
            <span className="wa-modal__group-meta">{g.members} members</span>
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="wa-modal__message">No groups match "{search}"</p>
        )}
      </div>
      {message && <p className="wa-modal__message">{message}</p>}
      <button
        className="btn btn--primary"
        onClick={handleConfirm}
        disabled={!selected || setting}
      >
        {setting ? 'Setting...' : 'Use This Group'}
      </button>
    </div>
  );
}

function WhatsAppConnectModal({ onClose, onGroupSet, mode }) {
  // mode: 'pick-group' (use cached groups) or 'connect' (full QR flow)
  const [qrUrl, setQrUrl] = useState(null);
  const [status, setStatus] = useState(mode === 'pick-group' ? 'loading-cache' : 'waiting');
  const [message, setMessage] = useState(mode === 'pick-group' ? 'Loading groups...' : 'Starting connection...');
  const [groups, setGroups] = useState([]);
  const statusRef = useRef(status);
  statusRef.current = status;

  // For pick-group mode: load cached groups, fallback to live fetch
  useEffect(() => {
    if (mode !== 'pick-group') return;
    let cancelled = false;
    (async () => {
      try {
        const cached = await fetchCachedGroups();
        if (cancelled) return;
        if (cached && cached.length > 0) {
          setGroups(cached);
          setStatus('selecting');
          setMessage('Select your DQC group:');
        } else {
          // No cache — auto-fetch via SSE (will use existing auth, no QR needed)
          setMessage('Fetching groups from WhatsApp...');
          const es = connectWhatsAppSSE(
            () => {}, // ignore QR (already authed)
            (data) => {
              if (data.status === 'connected' && !cancelled) {
                setMessage('Connected! Loading groups...');
              }
            },
            (data) => {
              if (!cancelled) {
                setGroups(data.groups);
                setStatus('selecting');
                setMessage('Select your DQC group:');
              }
              es.close();
            },
            (data) => {
              if (!cancelled) { setStatus('error'); setMessage(data.message || 'Failed to fetch groups'); }
              es.close();
            }
          );
        }
      } catch (err) {
        if (!cancelled) { setStatus('error'); setMessage(err.message || 'Failed to load groups'); }
      }
    })();
    return () => { cancelled = true; };
  }, [mode]);

  // For connect mode: SSE
  useEffect(() => {
    if (mode !== 'connect') return;
    const es = connectWhatsAppSSE(
      (data) => { setQrUrl(data.qr); setStatus('scanning'); setMessage('Scan with WhatsApp'); },
      (data) => {
        if (data.status === 'connected') {
          setStatus('connected');
          setMessage('Connected! Fetching groups...');
          setQrUrl(null);
        } else if (data.status === 'done') {
          if (statusRef.current !== 'selecting' && statusRef.current !== 'done') {
            setStatus('done');
            setMessage('Session complete');
          }
        } else if (data.status === 'logged_out') {
          setStatus('error');
          setMessage('Logged out. Try "Reset Session" first.');
        } else if (data.status === 'closed') {
          if (statusRef.current !== 'selecting' && statusRef.current !== 'done') {
            // don't error out, just ignore
          }
        }
      },
      (data) => {
        setGroups(data.groups);
        setStatus('selecting');
        setMessage('Select your DQC group:');
      },
      (data) => { setStatus('error'); setMessage(data.message || 'Connection error'); }
    );
    return () => { es.close(); };
  }, [mode]);

  const title = mode === 'pick-group' ? 'Select Group' : 'Connect WhatsApp';

  return (
    <div className="wa-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wa-modal">
        <div className="wa-modal__header">
          <h3>{title}</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>X</button>
        </div>

        <div className="wa-modal__body">
          {status === 'scanning' && qrUrl && (
            <div className="wa-modal__qr">
              <img src={qrUrl} alt="WhatsApp QR Code" width={300} height={300} />
              <p className="wa-modal__hint">
                WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device
              </p>
            </div>
          )}

          {(status === 'waiting' || status === 'connected' || status === 'loading-cache') && (
            <div className="wa-modal__loading">
              <div className="loader"><span className="loader__bar" /><span className="loader__bar" /><span className="loader__bar" /></div>
              <p className="wa-modal__message">{message}</p>
            </div>
          )}

          {status === 'selecting' && groups.length > 0 && (
            <GroupPicker
              groups={groups}
              onSelect={onGroupSet}
              onClose={onClose}
            />
          )}

          {status === 'done' && (
            <>
              <div className="wa-modal__done">
                <span className="wa-modal__check">&#10003;</span>
              </div>
              <p className="wa-modal__message">{message}</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="wa-modal__error-icon">!</div>
              <p className="wa-modal__message">{message}</p>
            </>
          )}

          {status === 'scanning' && (
            <p className="wa-modal__message">{message}</p>
          )}
        </div>
      </div>
    </div>
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
  const [showModal, setShowModal] = useState(null); // null | 'connect' | 'pick-group'

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
        {waStatus?.connected ? (
          waStatus?.groupName ? (
            <span className="wa-status__group-name" title={waStatus.groupId}>
              {waStatus.groupName}
              <button
                className="btn btn--sm btn--ghost"
                onClick={() => setShowModal('pick-group')}
                title="Change group"
              >
                Change
              </button>
            </span>
          ) : (
            <button
              className="btn btn--sm btn--primary"
              onClick={() => setShowModal('pick-group')}
            >
              Pick Group
            </button>
          )
        ) : (
          <button
            className="btn btn--sm btn--primary"
            onClick={() => setShowModal('connect')}
          >
            Connect WhatsApp
          </button>
        )}
        {waStatus?.loggedOut && (
          <button
            className="btn btn--sm btn--ghost"
            onClick={handleReconnect}
            disabled={reconnecting}
          >
            {reconnecting ? 'Resetting...' : 'Reset Session'}
          </button>
        )}
      </div>

      {reconnectMsg && (
        <div className="admin-panel__reconnect-msg">
          {reconnectMsg}
        </div>
      )}

      {showModal && (
        <WhatsAppConnectModal
          mode={showModal}
          onClose={() => { setShowModal(null); loadStatus(); }}
          onGroupSet={() => loadStatus()}
        />
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
