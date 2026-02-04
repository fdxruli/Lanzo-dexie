// src/config/botContext.js (REFACTORIZADO V3.0)

import { RUBRO_CONTEXTS } from './botContextByRubro';

export const GLOBAL_ALERT = {
  active: false, 
  id: 'update_v2_repair',
  title: "¡Actualización Importante!",
  message: "Hemos actualizado el sistema...",
  actionLink: "/configuracion?tab=maintenance"
};

/**
 * Sistema de Asistencia Inteligente v3.0
 * Ahora con contextos modulares por rubro y acciones directas
 */

// === HELPERS DE CONTEXTO TEMPORAL ===
const getTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
};

const getDayOfWeek = () => {
  const day = new Date().getDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
};

// === ANÁLISIS INTELIGENTE DE DATOS ===
const analyzeBusinessHealth = (data) => {
  const {
    cartCount = 0,
    lowStockCount = 0,
    licenseDays = 30,
    statsData = {},
    customersWithDebt = 0,
    businessType = []
  } = data;

  // Determinar rubro principal
  const primaryRubro = Array.isArray(businessType) 
    ? businessType[0] 
    : (typeof businessType === 'string' ? businessType.split(',')[0] : 'otro');

  return {
    rubro: primaryRubro,
    isRestaurant: primaryRubro === 'food_service',
    isPharmacy: primaryRubro === 'farmacia',
    isFruiter: primaryRubro === 'verduleria/fruteria',
    isApparel: primaryRubro === 'apparel',
    isHardware: primaryRubro === 'hardware'
  };
};

/**
 * 🔥 MOTOR PRINCIPAL DE CONTEXTO (MEJORADO)
 * Ahora consulta los módulos especializados por rubro
 */
export const getSmartContext = (pathname, data = {}) => {
  const timeOfDay = getTimeOfDay();
  const analysis = analyzeBusinessHealth(data);
  const { cartCount, cartTotal, lowStockCount, licenseDays } = data;

  // 1. OBTENER CONTEXTO DEL RUBRO
  const rubroContext = RUBRO_CONTEXTS[analysis.rubro] || RUBRO_CONTEXTS['abarrotes'];

  // 2. DETERMINAR SECCIÓN ACTUAL
  let section = 'default';
  if (pathname.startsWith('/pos') || pathname === '/') section = 'pos';
  else if (pathname.startsWith('/productos')) section = 'productos';
  else if (pathname.startsWith('/pedidos')) section = 'pedidos';
  else if (pathname.startsWith('/clientes')) section = 'clientes';
  else if (pathname.startsWith('/ventas') || pathname.startsWith('/dashboard')) section = 'ventas';
  else if (pathname.startsWith('/caja')) section = 'caja';

  // 3. OBTENER CONTEXTO DE LA SECCIÓN (Con fallback a default)
  const sectionContext = rubroContext[section] || {};
  
  // 4. DETERMINAR ESTADO (default, withCart, lowStock, etc.)
  let state = 'default';
  
  if (section === 'pos' && cartCount > 0) {
    state = 'withCart';
  } else if (section === 'productos' && lowStockCount > 0) {
    state = 'lowStock';
  }

  // 5. OBTENER CONFIGURACIÓN FINAL
  const config = sectionContext[state] || sectionContext['default'] || {};

  // 6. PROCESAR DATOS DINÁMICOS
  let finalMessage = typeof config.message === 'function' 
    ? config.message(data) 
    : (config.message || "Sistema listo");

  // 7. AGREGAR SALUDOS CONTEXTUALES (Solo para estados default)
  if (state === 'default' && section === 'pos') {
    const greetings = {
      morning: "¡Buenos días!",
      afternoon: "¡Buenas tardes!",
      evening: "¡Buenas tardes!",
      night: "Turno nocturno activo"
    };
    
    const greeting = greetings[timeOfDay];
    finalMessage = `${greeting} ${finalMessage}`;
  }

  // 8. AGREGAR ALERTAS CRÍTICAS (Sobrescribe todo)
  if (licenseDays <= 7 && licenseDays > 0) {
    return {
      title: licenseDays <= 3 ? "🚨 Licencia por Vencer" : "⏰ Renovación Próxima",
      message: `Tu suscripción expira en ${licenseDays} día${licenseDays > 1 ? 's' : ''}`,
      tips: [
        "Ve a Configuración → Licencia para renovar",
        licenseDays <= 3 && "⚠️ Renueva hoy para evitar interrupciones"
      ].filter(Boolean),
      actions: [
        { label: "Renovar Ahora", path: "/configuracion", icon: "🔑", highlight: true }
      ],
      icon: "🔑"
    };
  }

  // 9. RETORNAR CONTEXTO FINAL
  return {
    title: config.title || "Lanzo POS",
    message: finalMessage,
    tips: config.tips || [],
    actions: config.actions || [],
    icon: config.icon || "🤖"
  };
};

/**
 * 🆕 HELPER: Obtener acciones rápidas según contexto
 * Esto permite al bot mostrar botones de acción directa
 */
export const getQuickActions = (pathname, rubroType = 'abarrotes') => {
  // Acciones globales disponibles en cualquier rubro
  const globalActions = [
    { label: "Ir al POS", path: "/", icon: "" },
    { label: "Ver Inventario", path: "/productos", icon: "" },
    { label: "Estadísticas", path: "/ventas", icon: "" }
  ];

  // Acciones específicas por página
  const pageSpecificActions = {
    '/': [
      { label: "Ver Clientes", path: "/clientes", icon: "" },
      { label: "Registrar Gasto", path: "/caja", icon: "" }
    ],
    '/productos': [
      { label: "Añadir Producto", path: "/productos?tab=add", icon: "" },
      { label: "Gestionar Lotes", path: "/productos?tab=batches", icon: "" }
    ],
    '/clientes': [
      { label: "Nuevo Cliente", path: "/clientes?tab=add", icon: "" },
    ],
    '/ventas': [
      { label: "Exportar Datos", path: "/configuracion?tab=maintenance", icon: "" }
    ]
  };

  return pageSpecificActions[pathname] || globalActions;
};