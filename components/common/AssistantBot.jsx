import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSmartContext, GLOBAL_ALERT } from '../../config/botContext';
import { X, Wrench, AlertTriangle } from 'lucide-react';
import './AssistantBot.css';

// --- IMPORTAMOS LOS STORES PARA LA "INTELIGENCIA" ---
import { useOrderStore } from '../../store/useOrderStore';
import { useProductStore } from '../../store/useProductStore';
import { useAppStore } from '../../store/useAppStore';

const AssistantBot = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [isOpen, setIsOpen] = useState(false);
  const [showGlobalAlert, setShowGlobalAlert] = useState(false);

  // 1. LEER EL ESTADO DE LA APP (Zustand Hooks)
  const cartOrder = useOrderStore((state) => state.order);
  const getTotalPrice = useOrderStore((state) => state.getTotalPrice);
  const menuProducts = useProductStore((state) => state.menu); // Para calcular stock bajo
  const licenseDetails = useAppStore((state) => state.licenseDetails);

  // 2. CÁLCULOS DERIVADOS (Memoizados para rendimiento)
  const botData = useMemo(() => {
    // Calcular productos con stock bajo en tiempo real
    const lowStockCount = menuProducts.filter(p => 
      p.trackStock && p.isActive && p.stock <= (p.minStock || 0)
    ).length;

    // Calcular días de licencia restantes
    let licenseDays = 30;
    if (licenseDetails?.expires_at) {
      const diff = new Date(licenseDetails.expires_at) - new Date();
      licenseDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    return {
      cartCount: cartOrder.length,
      cartTotal: getTotalPrice(), // Usamos la función del store
      lowStockCount,
      licenseDays
    };
  }, [cartOrder, menuProducts, licenseDetails, getTotalPrice]);

  // 3. OBTENER CONTEXTO INTELIGENTE
  const context = useMemo(() => {
    return getSmartContext(location.pathname, botData);
  }, [location.pathname, botData]);


  // Efecto: Auto-abrir si hay alerta global no vista
  useEffect(() => {
    if (GLOBAL_ALERT.active) {
      const seenAlert = localStorage.getItem(`lanzo_alert_${GLOBAL_ALERT.id}`);
      if (!seenAlert) {
        setShowGlobalAlert(true);
        setIsOpen(true);
      }
    }
  }, []);

  const handleDismissAlert = () => {
    setShowGlobalAlert(false);
    localStorage.setItem(`lanzo_alert_${GLOBAL_ALERT.id}`, 'true');
  };

  return (
    <div className={`lanzo-bot-container ${isOpen ? 'open' : 'closed'}`}>
      
      {/* GLOBO DE MENSAJE */}
      {isOpen && (
        <div className="lanzo-bot-card animate-pop-in">
          <div className="bot-header">
            <span className="bot-title">
              {showGlobalAlert ? "Importante" : `${context?.title}`}
            </span>
            <button onClick={() => setIsOpen(false)} className="close-btn">
              <X size={16} />
            </button>
          </div>

          <div className="bot-body">
            {showGlobalAlert ? (
              <div className="alert-content">
                <p className="alert-text">{GLOBAL_ALERT.message}</p>
                {GLOBAL_ALERT.actionLink && (
                  <button onClick={() => { navigate(GLOBAL_ALERT.actionLink); setIsOpen(false); }} className="action-btn">
                    <Wrench size={16} style={{marginRight: 5}}/>
                    Ir a Reparación
                  </button>
                )}
                <button onClick={handleDismissAlert} className="dismiss-link">
                  Entendido
                </button>
              </div>
            ) : (
              <>
                <p className="context-message">{context?.message}</p>
                
                {context?.tips && context.tips.length > 0 && (
                  <div className="bot-tips">
                    <small>💡 Tips:</small>
                    <ul>
                      {context.tips.map((tip, idx) => (
                        <li key={idx}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* BOTÓN FLOTANTE (AVATAR) */}
      <button 
        className={`lanzo-bot-avatar ${showGlobalAlert ? 'has-alert' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Asistente Virtual"
      >
        {showGlobalAlert ? (
          <AlertTriangle size={24} color="white" />
        ) : (
          /* AQUÍ INTEGRAMOS TU LOGO SVG */
          <img 
            src="/boticon.svg" 
            alt="Bot Lanzo" 
            className="bot-icon-svg"
            onError={(e) => {
              // Fallback por si la imagen falla o no existe aún
              e.target.style.display = 'none'; 
              e.target.parentNode.innerHTML = '<span style="font-size: 24px;">🤖</span>';
            }} 
          />
        )}
        
        {/* Notificación si hay algo importante y está cerrado */}
        {!isOpen && !showGlobalAlert && (
          <span className="notification-dot"></span>
        )}
      </button>
    </div>
  );
};

export default AssistantBot;