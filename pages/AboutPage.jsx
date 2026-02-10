// src/pages/AboutPage.jsx
import React, { useState } from 'react';
import {
  Box, BarChart3, ShieldCheck,
  Map, ExternalLink, Bug, Lightbulb, Mail // Importamos Mail y quitamos MessageCircle si ya no se usa
} from 'lucide-react';
import { useProductStore } from '../store/useProductStore';
import Logo from '../components/common/Logo';
import ContactModal from '../components/common/ContactModal';
import './AboutPage.css';

const APP_VERSION = `v${import.meta.env.VITE_APP_VERSION}`;

// --- LÓGICA DE CORREO ELECTRÓNICO ---
const getEmailLink = (type, data) => {
  // TODO: Reemplaza con el correo real de soporte de tu negocio
  const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL; 
  
  let subject = '';
  let body = '';

  if (type === 'bug') {
    subject = `Reporte de Error [${APP_VERSION}] - Lanzo POS`;
    body = `Hola equipo de soporte,\n\nHe encontrado un problema:\n\n* Acción que realizaba: ${data.action}\n* Lo que pasó (Error): ${data.error}\n* Dispositivo: ${data.device}\n\nGracias.`;
  } else {
    subject = `Sugerencia de Función - Lanzo POS`;
    body = `Hola equipo,\n\nTengo una idea para mejorar Lanzo:\n\n* Mi idea: ${data.idea}\n* Beneficio: ${data.benefit}\n\nSaludos.`;
  }

  // Generamos el enlace mailto
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

export default function AboutPage() {
  const productCount = useProductStore(state => state.menu?.length || 0);
  const [modalInfo, setModalInfo] = useState({ show: false, type: '', title: '', fields: [] });

  const handleOpenModal = (type) => {
    if (type === 'bug') {
      setModalInfo({
        show: true, type: 'bug', title: 'Reportar un Problema',
        fields: [
          { id: 'action', label: '¿Qué estabas haciendo?', type: 'textarea' },
          { id: 'error', label: '¿Qué pasó? (Describe el error)', type: 'textarea' },
          { id: 'device', label: 'Tu Dispositivo (Ej. Android, PC)', type: 'input' }
        ]
      });
    } else {
      setModalInfo({
        show: true, type: 'feature', title: 'Sugerir una Función',
        fields: [
          { id: 'idea', label: '¿Cuál es tu idea?', type: 'textarea' },
          { id: 'benefit', label: '¿Por qué sería útil?', type: 'textarea' }
        ]
      });
    }
  };

  const handleSubmitContact = (formData) => {
    // Usamos la nueva función de Email
    window.location.href = getEmailLink(modalInfo.type, formData);
    setModalInfo({ show: false, type: '', title: '', fields: [] });
  };

  return (
    <div className="about-page-wrapper">

      {/* 1. HERO SECTION */}
      <section className="about-hero">
        <div className="hero-logo-wrapper">
          <Logo style={{ height: '60px', width: 'auto' }} />
        </div>
        <div className="hero-content">
          <span className="app-version">{APP_VERSION}</span>
          <h1 className="hero-slogan">El poder de un ERP, la sencillez de una App</h1>
          <p className="hero-description">
            Tienes en tus manos una herramienta profesional de gestión comercial.
            Sin suscripciones ocultas, sin dependencia de internet y diseñada para escalar contigo.
          </p>
        </div>
      </section>

      <div className="about-grid-layout">

        {/* --- COLUMNA IZQUIERDA --- */}
        <div className="about-col-left">
          <h3 className="section-header">¿Qué puedes hacer con Lanzo?</h3>
          
          <div className="bento-grid">
            <div className="bento-card feature-inventory">
              <div className="bento-header">
                <div className="bento-icon"><Box size={22} /></div>
                <h4>Gestión Profesional</h4>
              </div>
              <p>
                No solo guardas productos. Creas <strong>recetas</strong>, gestionas <strong>variantes</strong> y controlas <strong>lotes</strong>.
              </p>
            </div>

            <div className="bento-card feature-offline">
              <div className="bento-header">
                <div className="bento-icon"><Database size={22} /></div>
                <h4>Privacidad Total (Local)</h4>
              </div>
              <p>
                Tus datos viven en <strong>este dispositivo</strong>. Privacidad y velocidad garantizadas.
              </p>
            </div>

            <div className="bento-card feature-stats">
              <div className="bento-header">
                <div className="bento-icon"><BarChart3 size={22} /></div>
                <h4>Finanzas Reales</h4>
              </div>
              <p>
                Calculamos la <strong>utilidad neta</strong> real descontando costos al momento.
              </p>
            </div>

            <div className="bento-card feature-security">
              <div className="bento-header">
                <div className="bento-icon"><ShieldCheck size={22} /></div>
                <h4>Seguridad de Datos</h4>
              </div>
              <p>
                Exporta tus copias de seguridad cuando quieras. Tu información es tuya.
              </p>
            </div>
          </div>

          <div className="about-card roadmap-card">
            <div className="card-header-row">
              <Map size={24} className="icon-purple" />
              <h3>El Futuro de Lanzo</h3>
            </div>
            <p className="card-intro">Estamos construyendo constantemente. Esto es lo próximo:</p>
            <div className="roadmap-list">
              <div className="roadmap-item done"><span className="check">✓</span><span>Modo Oscuro / Claro Automático</span></div>
              <div className="roadmap-item done"><span className="check">✓</span><span>Escáner de Barras por Cámara</span></div>
              <div className="roadmap-item done"><span className="check">✓</span><span>Gestión de Recetas (KDS)</span></div>
              <div className="roadmap-item upcoming"><span className="dot">○</span><span>Envío de cotizaciones</span></div>
              <div className="roadmap-item upcoming"><span className="dot">○</span><span>Sincronización Multi-dispositivo</span></div>
            </div>
          </div>
        </div>

        {/* --- COLUMNA DERECHA --- */}
        <div className="about-col-right">

          {/* SPONSOR */}
          <div className="sponsor-card-premium">
            <div className="sponsor-bg-effect"></div>
            <div className="sponsor-content">
              <div className="sponsor-header"><span>Impulsado por</span></div>
              <h2 className="sponsor-name">Entre Alas</h2>
              <div className="sponsor-tagline" style={{ maxWidth: '450px', margin: '0 auto 2rem auto', lineHeight: '1.6' }}>
                <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '500' }}>
                  De <strong>Dark Kitchen</strong> a tu Aliado Tecnológico.
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', opacity: 0.9 }}>
                  Creamos herramientas para que emprendedores escalen sin límites.
                </p>
              </div>
              <div className="impact-counter">
                <span className="impact-label">Gestionando</span>
                <span className="impact-number">{productCount}</span>
                <span className="impact-label">productos</span>
              </div>
              <a href="https://ea-panel.vercel.app" target="_blank" rel="noopener noreferrer" className="btn-visit-sponsor">
                Ver nuestra web <ExternalLink size={16} />
              </a>
            </div>
          </div>

          {/* CONTACTO ACTUALIZADO A EMAIL */}
          <div className="about-card contact-card-modern">
            <h3>Ayúdanos a mejorar</h3>
            <p>¿Encontraste un error o tienes una sugerencia? Envíanos un correo.</p>

            <div className="contact-actions">
              <button onClick={() => handleOpenModal('bug')} className="btn-contact btn-bug">
                <Bug size={18} /> Reportar Fallo
              </button>
              <button onClick={() => handleOpenModal('feature')} className="btn-contact btn-idea">
                <Lightbulb size={18} /> Sugerir Función
              </button>
            </div>

            <div className="contact-footer">
              <small>Soporte oficial vía Correo Electrónico</small>
              <Mail size={14} className="icon-whatsapp" /> {/* Reutilizamos la clase icon-whatsapp para mantener estilos o cámbiala si prefieres */}
            </div>
          </div>

        </div>
      </div>

      <ContactModal
        show={modalInfo.show}
        onClose={() => setModalInfo({ ...modalInfo, show: false })}
        onSubmit={handleSubmitContact}
        title={modalInfo.title}
        fields={modalInfo.fields}
        submitLabel="Generar Correo" // Pasamos el nuevo texto del botón
      />
    </div>
  );
}