import { useRef, useState, useEffect } from 'react';
import Icon from './Icon';
import { ELIGIBILITY } from '../utils/quiz';
import { useBackClose } from '../utils/browser';

const WHEN = [['', 'Any time'], ['week', 'This week'], ['weekend', 'This weekend']];
const TEAM = [['solo', 'Solo'], ['team', 'Teams']];

function Chip({ on, onClick, children }) {
  return <button type="button" className="chip" aria-pressed={on} onClick={onClick}>{children}</button>;
}

// One row above the list: when, and a button that opens everything else.
// `quizzes` is what the filters would apply to (they only offer choices that exist there);
// `count` is how many are showing now.
export default function Filters({ filters, defaults, onChange, quizzes, count }) {
  const dialog = useRef(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
  }, [open]);
  useBackClose(open, () => dialog.current.close());
  const set = patch => onChange({ ...filters, ...patch });
  const toggleEligibility = tag => set({
    eligibility: filters.eligibility.includes(tag)
      ? filters.eligibility.filter(t => t !== tag)
      : [...filters.eligibility, tag],
  });
  const active = filters.eligibility.length + !!filters.search + !!filters.team + filters.free + filters.past;
  const eligibility = ELIGIBILITY.filter(tag => quizzes.some(q => q.eligibilityCategories?.includes(tag)));

  return (
    <div className="controls">
      <div className="when" role="group" aria-label="When">
        {WHEN.map(([value, text]) => (
          <button key={value} type="button" aria-pressed={filters.when === value} onClick={() => set({ when: value })}>
            {text}
          </button>
        ))}
      </div>
      <button type="button" className="controls__more" onClick={() => setOpen(true)}>
        <Icon name="filter" />Filters{active > 0 && <span className="controls__active">{active}</span>}
      </button>

      {/* A click on the backdrop lands on the dialog element itself */}
      <dialog ref={dialog} className="sheet" aria-labelledby="filters-title" onClose={() => setOpen(false)}
        onClick={e => e.target === dialog.current && dialog.current.close()}>
        <form method="dialog">
          {/* focusable so that opening the sheet lands here, not in the search box with a keyboard over everything */}
          <h2 id="filters-title" tabIndex={-1}>Search and filter</h2>
          <label className="search">
            <Icon name="search" />
            <input
              type="search"
              value={filters.search}
              onChange={e => set({ search: e.target.value })}
              placeholder="Quiz, host or quizmaster"
              aria-label="Search quizzes"
            />
          </label>

          {eligibility.length > 0 && (
            <fieldset>
              <legend>Who can play</legend>
              {eligibility.map(tag => (
                <Chip key={tag} on={filters.eligibility.includes(tag)} onClick={() => toggleEligibility(tag)}>{tag}</Chip>
              ))}
            </fieldset>
          )}
          {quizzes.some(q => q.teamSize) && (
            <fieldset>
              <legend>Team size</legend>
              {TEAM.map(([value, text]) => (
                <Chip key={value} on={filters.team === value}
                  onClick={() => set({ team: filters.team === value ? '' : value })}>{text}</Chip>
              ))}
            </fieldset>
          )}
          {quizzes.some(q => q.entryFee) && (
            <label className="check">
              <input type="checkbox" checked={filters.free} onChange={e => set({ free: e.target.checked })} />
              Free entry only
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={filters.past} onChange={e => set({ past: e.target.checked })} />
            Show past quizzes
          </label>

          <div className="sheet__actions">
            <button type="button" className="btn" disabled={!active && !filters.when} onClick={() => onChange(defaults)}>
              Clear all
            </button>
            <button className="btn btn--primary">Show {count} {count === 1 ? 'quiz' : 'quizzes'}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
