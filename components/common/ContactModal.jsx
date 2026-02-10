import React, { useState, useEffect } from 'react';
import './ContactModal.css';

// Agregamos 'submitLabel' a las props con un valor por defecto
export default function ContactModal({ show, onClose, onSubmit, title, fields, submitLabel = "Enviar Mensaje" }) {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (show) {
      const initialData = fields.reduce((acc, field) => {
        acc[field.id] = '';
        return acc;
      }, {});
      setFormData(initialData);
    }
  }, [show, fields]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
    onClose();
  };

  if (!show) {
    return null;
  }

  return (
    <div className="modal" style={{ display: 'flex', zIndex: 'var(--z-modal-critical)' }}>
      <div className="modal-content contact-modal">
        <h2 className="modal-title">{title}</h2>
        <form onSubmit={handleSubmit}>

          {fields.map(field => (
            <div className="form-group" key={field.id}>
              <label className="form-label" htmlFor={field.id}>
                {field.label}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  className="form-textarea"
                  id={field.id}
                  name={field.id}
                  value={formData[field.id] || ''}
                  onChange={handleChange}
                  required
                  autoFocus={field.id === fields[0].id}
                />
              ) : (
                <input
                  className="form-input"
                  type="text"
                  id={field.id}
                  name={field.id}
                  value={formData[field.id] || ''}
                  onChange={handleChange}
                  required
                  autoFocus={field.id === fields[0].id}
                />
              )}
            </div>
          ))}

          {/* Usamos la prop submitLabel para el texto del botón */}
          <button type="submit" className="btn btn-save">
            {submitLabel}
          </button>
          <button type="button" className="btn btn-cancel" onClick={onClose}>
            Cancelar
          </button>
        </form>
      </div>
    </div>
  );
}