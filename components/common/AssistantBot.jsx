// src/components/common/AssistantBot.jsx (V3.0 - SÚPER INTELIGENTE)

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSmartContext, getQuickActions, GLOBAL_ALERT } from '../../config/botContext';
import {
  X, Wrench, AlertTriangle, ExternalLink, Send,
  Sparkles, HelpCircle, TrendingUp, Package, Users,
  DollarSign, Calendar, BarChart3, Lightbulb
} from 'lucide-react';
import './AssistantBot.css';

// --- STORES PARA INTELIGENCIA ---
import { useOrderStore } from '../../store/useOrderStore';
import { useProductStore } from '../../store/useProductStore';
import { useAppStore } from '../../store/useAppStore';
import { useSalesStore } from '../../store/useSalesStore';
import { useStatsStore } from '../../store/useStatsStore';
import { STORES, loadData } from '../../services/database';

// ===================================================================
// 🧠 MOTOR DE INTELIGENCIA ARTIFICIAL DEL ASISTENTE
// ===================================================================

const AI_KNOWLEDGE_BASE = {
  // Preguntas Frecuentes sobre Funcionalidades
  funcionalidades: {
    triggers: ['cómo', 'como', 'puedo', 'hacer', 'función', 'funciona', 'usar'],
    responses: {
      'agregar producto': {
        keywords: ['agregar', 'añadir', 'crear', 'nuevo', 'producto'],
        answer: 'Para agregar un producto: Ve a **Productos** → **Añadir Producto** → Completa los datos básicos (nombre, precio, costo) → Guarda.',
        action: { label: 'Ir a Productos', path: '/productos?tab=add', icon: '' }
      },
      'vender fiado': {
        keywords: ['fiado', 'crédito', 'fiar', 'deuda'],
        answer: 'Para vender fiado: Agrega productos al carrito → **Cobrar** → Selecciona método "Fiado" → Busca/crea el cliente → El saldo se guardará automáticamente.',
        action: { label: 'Ver Clientes', path: '/clientes', icon: '' }
      },
      'gestionar lotes': {
        keywords: ['lote', 'batch', 'caducidad', 'fifo', 'variante'],
        answer: 'Los lotes permiten control FIFO, fechas de caducidad y SKUs únicos. Ve a **Productos** → **Gestionar Lotes** para configurar.',
        action: { label: 'Ir a Lotes', path: '/productos?tab=batches', icon: '' }
      },
      'corte de caja': {
        keywords: ['corte', 'caja', 'turno', 'cerrar', 'auditar'],
        answer: 'El corte de caja te permite auditar el efectivo del día. Ve a **Caja** → **Corte de Caja**, ingresa el efectivo físico contado, y el sistema calculará la diferencia.',
        action: { label: 'Ir a Caja', path: '/caja', icon: '' }
      },
      'backup': {
        keywords: ['respaldo', 'backup', 'copia', 'exportar', 'guardar'],
        answer: '**IMPORTANTE**: Tus datos están en este dispositivo. Haz respaldos semanales: **Configuración** → **Datos y Mantenimiento** → **Descargar Respaldo**.',
        action: { label: 'Ir a Configuración', path: '/configuracion?tab=maintenance', icon: '' }
      },
      'mayoreo': {
        keywords: ['mayoreo', 'wholesale', 'descuento', 'cantidad'],
        answer: 'Configura precios por volumen: Edita un producto → Activa "Precios de Mayoreo" → Define cantidad mínima y precio especial.',
        action: { label: 'Ver Productos', path: '/productos', icon: '' }
      },
      'recetas': {
        keywords: ['receta', 'platillo', 'ingrediente', 'cocina', 'kds'],
        answer: 'Para platillos con ingredientes: Crea el producto → Activa "Es una receta" → Agrega ingredientes/insumos → El sistema descontará automáticamente del inventario.',
        action: { label: 'Crear Platillo', path: '/productos?tab=add', icon: '' }
      }
    }
  },

  // Problemas Comunes y Soluciones
  problemas: {
    triggers: ['error', 'problema', 'no funciona', 'falla', 'ayuda'],
    solutions: {
      'stock negativo': {
        keywords: ['stock', 'negativo', 'inventario', 'inconsistencia'],
        answer: '⚠️ Si ves stock negativo, ve a **Configuración** → **Datos y Mantenimiento** → **Sincronizar Stock** para corregirlo automáticamente.',
        severity: 'high'
      },
      'diferencia en caja': {
        keywords: ['diferencia', 'caja', 'dinero', 'falta', 'sobra'],
        answer: 'Las diferencias pueden ser por: ventas no registradas, gastos no anotados, o errores al contar. Revisa los movimientos en **Caja** → **Historial**.',
        severity: 'medium'
      },
      'producto no aparece': {
        keywords: ['no aparece', 'no veo', 'perdido', 'desaparecido'],
        answer: 'Verifica: 1) ¿Está activo? (puede estar desactivado), 2) ¿Está en la categoría correcta?, 3) Intenta buscarlo por código de barras.',
        severity: 'low'
      }
    }
  },

  // Consejos de Negocio
  consejos: {
    triggers: ['consejo', 'recomendación', 'sugerencia', 'tip'],
    tips: [
      {
        titulo: '💡 Control de Costos',
        mensaje: 'Revisa el margen de utilidad de tus productos más vendidos. Si es menor al 30%, considera ajustar precios o negociar con proveedores.',
        icon: '💰'
      },
      {
        titulo: '📊 Análisis de Inventario',
        mensaje: 'Productos con rotación lenta ocupan capital. Considera promociones para liquidar stock que lleva más de 3 meses sin venderse.',
        icon: '📦'
      },
      {
        titulo: '🎯 Fidelización',
        mensaje: 'Los clientes que compran fiado tienden a ser más leales. Ofrece pequeños descuentos por pago puntual para incentivar.',
        icon: '👥'
      },
      {
        titulo: '⏰ Horarios de Mayor Venta',
        mensaje: 'Analiza tus estadísticas por horario. Considera tener más personal o stock en las horas pico.',
        icon: '📈'
      }
    ]
  }
};

// ===================================================================
// 🎯 FUNCIÓN PRINCIPAL DE IA: PROCESAR PREGUNTAS DEL USUARIO
// ===================================================================

const processUserQuestion = (question, businessData) => {
  const lowerQuestion = question.toLowerCase();

  // 1. BÚSQUEDA EN BASE DE CONOCIMIENTO
  for (const [category, config] of Object.entries(AI_KNOWLEDGE_BASE)) {
    if (category === 'funcionalidades') {
      for (const [key, info] of Object.entries(config.responses)) {
        if (info.keywords.some(kw => lowerQuestion.includes(kw))) {
          return {
            type: 'answer',
            message: info.answer,
            action: info.action,
            confidence: 'high'
          };
        }
      }
    }

    if (category === 'problemas') {
      for (const [key, info] of Object.entries(config.solutions)) {
        if (info.keywords.some(kw => lowerQuestion.includes(kw))) {
          return {
            type: 'solution',
            message: info.answer,
            severity: info.severity,
            confidence: 'high'
          };
        }
      }
    }
  }

  // 2. ANÁLISIS CONTEXTUAL INTELIGENTE
  if (lowerQuestion.includes('vend') || lowerQuestion.includes('gano') || lowerQuestion.includes('utilidad')) {
    return generateSalesInsight(businessData);
  }

  if (lowerQuestion.includes('stock') || lowerQuestion.includes('inventario') || lowerQuestion.includes('productos')) {
    return generateInventoryInsight(businessData);
  }

  if (lowerQuestion.includes('cliente') || lowerQuestion.includes('deuda')) {
    return generateCustomerInsight(businessData);
  }

  // 3. RESPUESTA GENÉRICA CON OPCIONES
  return {
    type: 'menu',
    message: 'No estoy seguro de entender tu pregunta. ¿Te refieres a alguno de estos temas?',
    options: [
      { label: 'Gestión de Productos', query: 'cómo agregar productos' },
      { label: 'Ventas y Caja', query: 'cómo hacer corte de caja' },
      { label: 'Clientes y Fiado', query: 'cómo vender fiado' },
      { label: 'Reportes', query: 'cómo ver mis ganancias' }
    ]
  };
};

// ===================================================================
// 🔍 GENERADORES DE INSIGHTS INTELIGENTES
// ===================================================================

const generateSalesInsight = (data) => {
  const { stats } = data;
  const margen = stats.totalRevenue > 0
    ? ((stats.totalNetProfit / stats.totalRevenue) * 100).toFixed(1)
    : 0;

  let message = `📊 **Tu Negocio Hoy:**\n\n`;
  message += `• Ventas: $${stats.totalRevenue.toFixed(2)}\n`;
  message += `• Utilidad Neta: $${stats.totalNetProfit.toFixed(2)}\n`;
  message += `• Margen: ${margen}%\n`;
  message += `• Pedidos: ${stats.totalOrders}\n\n`;

  if (parseFloat(margen) < 25) {
    message += `⚠️ Tu margen está bajo. Considera revisar costos o ajustar precios.`;
  } else if (parseFloat(margen) > 50) {
    message += `✨ ¡Excelente margen! Tu negocio es rentable.`;
  }

  return {
    type: 'insight',
    message,
    action: { label: 'Ver Estadísticas Completas', path: '/ventas', icon: '📊' }
  };
};

const generateInventoryInsight = (data) => {
  const { lowStockCount, stats } = data;

  let message = `📦 **Estado de Inventario:**\n\n`;
  message += `• Valor Total: $${stats.inventoryValue?.toFixed(2) || '0.00'}\n`;

  if (lowStockCount > 0) {
    message += `• ⚠️ ${lowStockCount} producto${lowStockCount > 1 ? 's' : ''} con stock bajo\n\n`;
    message += `Revisa la pestaña de **Reabastecimiento** para ver qué productos necesitas comprar.`;
  } else {
    message += `• ✅ Todos los productos tienen stock suficiente\n\n`;
    message += `Tip: Revisa tu inventario semanalmente para evitar faltantes.`;
  }

  return {
    type: 'insight',
    message,
    action: { label: 'Ver Productos', path: '/productos', icon: '📦' }
  };
};

const generateCustomerInsight = async () => {
  try {
    const customers = await loadData(STORES.CUSTOMERS);
    const withDebt = customers?.filter(c => c.debt > 0) || [];
    const totalDebt = withDebt.reduce((sum, c) => sum + c.debt, 0);

    let message = `👥 **Gestión de Clientes:**\n\n`;
    message += `• Total Clientes: ${customers?.length || 0}\n`;
    message += `• Con Deuda: ${withDebt.length}\n`;
    message += `• Deuda Total: $${totalDebt.toFixed(2)}\n\n`;

    if (withDebt.length > 0) {
      message += `💡 Tip: Envía recordatorios por WhatsApp desde la lista de clientes para recuperar cartera.`;
    }

    return {
      type: 'insight',
      message,
      action: { label: 'Ver Clientes', path: '/clientes', icon: '👥' }
    };
  } catch (e) {
    return {
      type: 'error',
      message: 'No pude cargar información de clientes en este momento.'
    };
  }
};

// ===================================================================
// 🎨 COMPONENTE PRINCIPAL DEL ASISTENTE
// ===================================================================

const AssistantBot = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [showGlobalAlert, setShowGlobalAlert] = useState(false);
  const [chatMode, setChatMode] = useState(false); // Nuevo: Modo conversación
  const [messages, setMessages] = useState([]); // Historial de chat
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // 1. LEER ESTADO DE LA APP
  const cartOrder = useOrderStore((state) => state.order);
  const getTotalPrice = useOrderStore((state) => state.getTotalPrice);
  const menuProducts = useProductStore((state) => state.menu);
  const stats = useStatsStore((state) => state.stats);
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
      businessType: companyProfile?.business_type || [],
      stats
    };
  }, [cartOrder, menuProducts, stats, licenseDetails, getTotalPrice, companyProfile]);

  // 3. OBTENER CONTEXTO INTELIGENTE
  const context = useMemo(() => {
    return getSmartContext(location.pathname, botData);
  }, [location.pathname, botData]);

  // 4. OBTENER ACCIONES RÁPIDAS
  const quickActions = useMemo(() => {
    if (context?.actions && context.actions.length > 0) {
      return context.actions;
    }

    const rubroType = Array.isArray(botData.businessType)
      ? botData.businessType[0]
      : 'abarrotes';

    return getQuickActions(location.pathname, rubroType);
  }, [context, location.pathname, botData.businessType]);

  // Auto-scroll del chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    setIsOpen(false);
  };

  const handleQuickAction = (action) => {
    setIsOpen(false);
    navigate(action.path);
  };

  // ===================================================================
  // 🤖 MANEJO DEL CHAT INTELIGENTE
  // ===================================================================

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

    const userMessage = { type: 'user', text: userInput, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setIsTyping(true);

    // Simular delay de "pensamiento" para UX natural
    await new Promise(resolve => setTimeout(resolve, 800));

    const aiResponse = await processUserQuestion(userInput, botData);

    let botMessage = {
      type: 'bot',
      timestamp: Date.now(),
      ...aiResponse
    };

    setMessages(prev => [...prev, botMessage]);
    setIsTyping(false);
  };

  const handleSuggestedQuestion = (query) => {
    setUserInput(query);
    handleSendMessage();
  };

  const handleRandomTip = () => {
    const tips = AI_KNOWLEDGE_BASE.consejos.tips;
    const randomTip = tips[Math.floor(Math.random() * tips.length)];

    setMessages(prev => [...prev, {
      type: 'bot',
      message: `${randomTip.titulo}\n\n${randomTip.mensaje}`,
      timestamp: Date.now()
    }]);
  };

  const botRef = useRef(null);

  // Agrega este useEffect
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Si está abierto, y el clic no fue dentro del bot ni en el botón de avatar
      if (isOpen && botRef.current && !botRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={botRef} className={`lanzo-bot-container ${isOpen ? 'open' : 'closed'}`}>

      {/* GLOBO DE MENSAJE */}
      {isOpen && (
        <div className="lanzo-bot-card animate-pop-in">
          <div className="bot-header">
            <span className="bot-title">
              {chatMode ? (
                <>
                  <Sparkles size={16} style={{ marginRight: '6px' }} />
                  Asistente IA
                </>
              ) : (
                showGlobalAlert ? "Importante" : `${context?.title}`
              )}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {!showGlobalAlert && (
                <button
                  onClick={() => setChatMode(!chatMode)}
                  className="mode-toggle-btn"
                  title={chatMode ? 'Ver Contexto' : 'Preguntar al Asistente'}
                >
                  {chatMode ? <HelpCircle size={16} /> : <Sparkles size={16} />}
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="close-btn">
                <X size={16} />
              </button>
            </div>
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
                    <Wrench size={16} style={{ marginRight: 5 }} />
                    Ir a Reparación
                  </button>
                )}
                <button onClick={handleDismissAlert} className="dismiss-link">
                  Entendido
                </button>
              </div>
            ) : chatMode ? (
              // --- MODO CHAT IA ---
              <div className="chat-container">
                <div className="chat-messages">
                  {messages.length === 0 ? (
                    <div className="chat-welcome">
                      <Sparkles size={32} style={{ color: 'var(--primary-color)' }} />
                      <h4>¡Hola! Soy tu asistente inteligente</h4>
                      <p>Pregúntame cualquier cosa sobre tu negocio:</p>
                      <div className="suggested-questions">
                        <button onClick={() => handleSuggestedQuestion('¿Cuánto he vendido?')}>
                          ¿Cuánto he vendido?
                        </button>
                        <button onClick={() => handleSuggestedQuestion('¿Cómo agregar productos?')}>
                          ¿Cómo agregar productos?
                        </button>
                        <button onClick={() => handleSuggestedQuestion('¿Qué productos me faltan?')}>
                          ¿Qué productos me faltan?
                        </button>
                        <button onClick={handleRandomTip}>
                          Dame un consejo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, idx) => (
                        <div key={idx} className={`chat-message ${msg.type}`}>
                          {msg.type === 'bot' && (
                            <div className="message-avatar">
                              <Sparkles size={14} />
                            </div>
                          )}
                          <div className="message-bubble">
                            <p style={{ whiteSpace: 'pre-line' }}>{msg.message || msg.text}</p>
                            {msg.action && (
                              <button
                                className="inline-action-btn"
                                onClick={() => handleQuickAction(msg.action)}
                              >
                                {msg.action.icon} {msg.action.label}
                              </button>
                            )}
                            {msg.options && (
                              <div className="message-options">
                                {msg.options.map((opt, i) => (
                                  <button
                                    key={i}
                                    className="option-btn"
                                    onClick={() => handleSuggestedQuestion(opt.query)}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {isTyping && (
                        <div className="chat-message bot">
                          <div className="message-avatar">
                            <Sparkles size={14} />
                          </div>
                          <div className="message-bubble typing">
                            <span></span><span></span><span></span>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </>
                  )}
                </div>

                <div className="chat-input-wrapper">
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Escribe tu pregunta..."
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <button
                    className="send-btn"
                    onClick={handleSendMessage}
                    disabled={!userInput.trim()}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            ) : (
              // --- MODO CONTEXTO (ORIGINAL MEJORADO) ---
              <>
                <p className="context-message">{context?.message}</p>

                {/* SECCIÓN DE ACCIONES RÁPIDAS */}
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
        className={`lanzo-bot-avatar ${showGlobalAlert ? 'has-alert' : ''} ${chatMode && isOpen ? 'chat-active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Asistente Virtual"
      >
        {showGlobalAlert ? (
          <AlertTriangle size={24} color="white" />
        ) : chatMode && isOpen ? (
          <Sparkles size={24} color="white" />
        ) : (
          <img
            src="/boticon.svg"
            alt="Asistente"
            className="bot-icon-svg"
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