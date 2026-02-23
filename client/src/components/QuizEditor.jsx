import { useState, useEffect } from 'react';

const EMPTY_FORM = {
  name: '',
  description: '',
  date: '',
  time: '',
  venue: '',
  eligibility: '',
  hostingOrg: '',
  quizMasters: '',
  pocName: '',
  pocPhone: '',
  pocWhatsapp: '',
  regLink: '',
  instagramLink: '',
};

function quizToForm(quiz) {
  if (!quiz) return { ...EMPTY_FORM };
  const d = quiz.date ? new Date(quiz.date) : null;
  return {
    name: quiz.name || '',
    description: quiz.description || '',
    date: d ? d.toISOString().slice(0, 10) : '',
    time: d ? d.toTimeString().slice(0, 5) : '',
    venue: quiz.venue || '',
    eligibility: (quiz.eligibility || []).join(', '),
    hostingOrg: quiz.hostingOrg || '',
    quizMasters: (quiz.quizMasters || []).join(', '),
    pocName: quiz.poc?.name || '',
    pocPhone: quiz.poc?.phone || '',
    pocWhatsapp: quiz.poc?.whatsapp || '',
    regLink: quiz.regLink || '',
    instagramLink: quiz.instagramLink || '',
  };
}

function formToPayload(form) {
  // Combine date + time into ISO string
  let date = null;
  if (form.date) {
    const timeStr = form.time || '00:00';
    date = new Date(`${form.date}T${timeStr}:00`).toISOString();
  }

  return {
    name: form.name,
    description: form.description,
    date,
    venue: form.venue,
    eligibility: form.eligibility.split(',').map(s => s.trim()).filter(Boolean),
    hostingOrg: form.hostingOrg,
    quizMasters: form.quizMasters.split(',').map(s => s.trim()).filter(Boolean),
    poc: {
      name: form.pocName,
      phone: form.pocPhone,
      whatsapp: form.pocWhatsapp,
    },
    regLink: form.regLink,
    instagramLink: form.instagramLink,
  };
}

export default function QuizEditor({ quiz, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => quizToForm(quiz));

  useEffect(() => {
    setForm(quizToForm(quiz));
  }, [quiz]);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave(formToPayload(form));
  }

  const isEdit = !!quiz;

  return (
    <div className="quiz-editor">
      <h2 className="quiz-editor__title">
        {isEdit ? '// Edit Quiz' : '// New Quiz'}
      </h2>
      <form onSubmit={handleSubmit} className="quiz-editor__form">
        <div className="quiz-editor__row">
          <label className="quiz-editor__label">
            Name *
            <input
              className="quiz-editor__input"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Annual General Quiz"
            />
          </label>
        </div>

        <div className="quiz-editor__row">
          <label className="quiz-editor__label">
            Description
            <textarea
              className="quiz-editor__textarea"
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={5}
              placeholder="Markdown supported: **bold**, *italic*, - bullet lists"
            />
          </label>
        </div>

        <div className="quiz-editor__row quiz-editor__row--half">
          <label className="quiz-editor__label">
            Date
            <input
              className="quiz-editor__input"
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
            />
          </label>
          <label className="quiz-editor__label">
            Time
            <input
              className="quiz-editor__input"
              type="time"
              name="time"
              value={form.time}
              onChange={handleChange}
            />
          </label>
        </div>

        <div className="quiz-editor__row">
          <label className="quiz-editor__label">
            Venue
            <input
              className="quiz-editor__input"
              name="venue"
              value={form.venue}
              onChange={handleChange}
              placeholder="Seminar Hall, North Campus"
            />
          </label>
        </div>

        <div className="quiz-editor__row">
          <label className="quiz-editor__label">
            Eligibility (comma-separated)
            <input
              className="quiz-editor__input"
              name="eligibility"
              value={form.eligibility}
              onChange={handleChange}
              placeholder="Open, U25, UG"
            />
          </label>
        </div>

        <div className="quiz-editor__row">
          <label className="quiz-editor__label">
            Hosting Org
            <input
              className="quiz-editor__input"
              name="hostingOrg"
              value={form.hostingOrg}
              onChange={handleChange}
              placeholder="Quiz Club DU"
            />
          </label>
        </div>

        <div className="quiz-editor__row">
          <label className="quiz-editor__label">
            Quiz Masters (comma-separated)
            <input
              className="quiz-editor__input"
              name="quizMasters"
              value={form.quizMasters}
              onChange={handleChange}
              placeholder="Alice, Bob"
            />
          </label>
        </div>

        <fieldset className="quiz-editor__fieldset">
          <legend className="quiz-editor__legend">Point of Contact</legend>
          <div className="quiz-editor__row quiz-editor__row--thirds">
            <label className="quiz-editor__label">
              Name
              <input
                className="quiz-editor__input"
                name="pocName"
                value={form.pocName}
                onChange={handleChange}
              />
            </label>
            <label className="quiz-editor__label">
              Phone
              <input
                className="quiz-editor__input"
                name="pocPhone"
                value={form.pocPhone}
                onChange={handleChange}
                placeholder="+91..."
              />
            </label>
            <label className="quiz-editor__label">
              WhatsApp
              <input
                className="quiz-editor__input"
                name="pocWhatsapp"
                value={form.pocWhatsapp}
                onChange={handleChange}
                placeholder="+91..."
              />
            </label>
          </div>
        </fieldset>

        <div className="quiz-editor__row quiz-editor__row--half">
          <label className="quiz-editor__label">
            Registration Link
            <input
              className="quiz-editor__input"
              name="regLink"
              value={form.regLink}
              onChange={handleChange}
              placeholder="https://..."
            />
          </label>
          <label className="quiz-editor__label">
            Instagram Link
            <input
              className="quiz-editor__input"
              name="instagramLink"
              value={form.instagramLink}
              onChange={handleChange}
              placeholder="https://instagram.com/..."
            />
          </label>
        </div>

        <div className="quiz-editor__actions">
          <button className="btn btn--primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Quiz'}
          </button>
          <button className="btn btn--secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
