import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

const UpdatePrompt = () => {
  // Este hook se conecta al Service Worker generado por VitePWA
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registrado:', r);
    },
    onRegisterError(error) {
      console.error('Error registrando SW:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999,
      backgroundColor: '#1e293b', color: 'white', padding: '16px',
      borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '300px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '500' }}>
          ✨ Nueva versión disponible
        </p>
        <button 
          onClick={() => setNeedRefresh(false)}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
        >
          <X size={16} />
        </button>
      </div>
      <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1' }}>
        Guarda tu venta actual y actualiza para aplicar las mejoras.
      </p>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          backgroundColor: '#3b82f6', color: 'white', border: 'none',
          padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
        }}
      >
        <RefreshCw size={16} />
        Actualizar ahora
      </button>
    </div>
  );
};

export default UpdatePrompt;