// src/components/common/AssistantBot.jsx (MEJORADO V2.0)

import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSmartContext, getQuickActions, GLOBAL_ALERT } from '../../config/botContext';
import { X, Wrench, AlertTriangle, ExternalLink } from 'lucide-react';
import './AssistantBot.css';

// --- STORES PARA INTELIGENCIA ---
import { useOrderStore } from '../../store/useOrderStore';
import { useProductStore } from '../../store/useProductStore';
import { useAppStore } from '../../store/useAppStore';

const AssistantBot = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [isOpen, setIsOpen] = useState(false);
  const [showGlobalAlert, setShowGlobalAlert] = useState(false);

  // 1. LEER ESTADO DE LA APP
  const cartOrder = useOrderStore((state) => state.order);
  const getTotalPrice = useOrderStore((state) => state.getTotalPrice);
  const menuProducts = useProductStore((state) => state.menu);
  const licenseDetails = useAppStore((state) => state.licenseDetails);
  const companyProfile = useAppStore((state) => state.companyProfile);

  // 2. CÁLCULOS DERIVADOS
  const botData = useMemo(() => {
    const lowStockCount = menuProducts.filter(p => 
      p.trackStock && p.isActive && p.stock <= (p.minStock || 0)
    ).length;

    let licenseDays = 30;
    if (licenseDetails?.expires_at) {
      const diff = new Date(licenseDetails.expires_at) - new Date();
      licenseDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    return {
      cartCount: cartOrder.length,
      cartTotal: getTotalPrice(),
      lowStockCount,
      licenseDays,
      businessType: companyProfile?.business_type || []
    };
  }, [cartOrder, menuProducts, licenseDetails, getTotalPrice, companyProfile]);

  // 3. OBTENER CONTEXTO INTELIGENTE
  const context = useMemo(() => {
    return getSmartContext(location.pathname, botData);
  }, [location.pathname, botData]);

  // 🆕 4. OBTENER ACCIONES RÁPIDAS
  const quickActions = useMemo(() => {
    // Si el contexto ya tiene acciones específicas, usamos esas
    if (context?.actions && context.actions.length > 0) {
      return context.actions;
    }
    
    // Si no, generamos acciones genéricas según la página
    const rubroType = Array.isArray(botData.businessType) 
      ? botData.businessType[0] 
      : 'abarrotes';
    
    return getQuickActions(location.pathname, rubroType);
  }, [context, location.pathname, botData.businessType]);

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

  // 🆕 HANDLER PARA ACCIONES RÁPIDAS
  const handleQuickAction = (action) => {
    setIsOpen(false); // Cerramos el bot
    navigate(action.path); // Navegamos
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
              // --- ALERTA GLOBAL ---
              <div className="alert-content">
                <p className="alert-text">{GLOBAL_ALERT.message}</p>
                {GLOBAL_ALERT.actionLink && (
                  <button 
                    onClick={() => { 
                      navigate(GLOBAL_ALERT.actionLink); 
                      setIsOpen(false); 
                    }} 
                    className="action-btn"
                  >
                    <Wrench size={16} style={{marginRight: 5}}/>
                    Ir a Reparación
                  </button>
                )}
                <button onClick={handleDismissAlert} className="dismiss-link">
                  Entendido
                </button>
              </div>
            ) : (
              // --- CONTENIDO NORMAL ---
              <>
                <p className="context-message">{context?.message}</p>
                
                {/* 🆕 SECCIÓN DE ACCIONES RÁPIDAS */}
                {quickActions && quickActions.length > 0 && (
                  <div className="bot-actions">
                    <small className="actions-label">Acciones rápidas:</small>
                    <div className="actions-grid">
                      {quickActions.map((action, idx) => (
                        <button
                          key={idx}
                          className={`quick-action-btn ${action.highlight ? 'highlight' : ''}`}
                          onClick={() => handleQuickAction(action)}
                        >
                          <span className="action-icon">{action.icon}</span>
                          <span className="action-label">{action.label}</span>
                          <ExternalLink size={12} className="action-arrow" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* TIPS (Solo si hay) */}
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
          <img 
            src="/boticon.svg" 
            alt="Bot Lanzo" 
            className="bot-icon-svg"
            onError={(e) => {
              e.target.style.display = 'none'; 
              e.target.parentNode.innerHTML = '<span style="font-size: 24px;">🤖</span>';
            }} 
          />
        )}
        
        {/* Notificación si hay algo importante y está cerrado */}
        {!isOpen && (botData.lowStockCount > 0 || botData.licenseDays <= 7) && (
          <span className="notification-dot"></span>
        )}
      </button>
    </div>
  );
};

export default AssistantBot;