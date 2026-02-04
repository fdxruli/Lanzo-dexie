// src/config/botContext.js

export const GLOBAL_ALERT = {
  active: false, 
  id: 'update_v2_repair',
  title: "¡Actualización Importante!",
  message: "Hemos actualizado el sistema...",
  actionLink: "/settings"
};

/**
 * Sistema de Asistencia Inteligente v2.0
 * Contextualiza mensajes según: Ruta, Estado del Negocio, Hora del Día y Rubro
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
    isFruiter: primaryRubro === 'verduleria/fruteria'
  };
};

/**
 * Motor Principal de Contexto
 */
export const getSmartContext = (pathname, data = {}) => {
  const timeOfDay = getTimeOfDay();
  const analysis = analyzeBusinessHealth(data);
  const { cartCount, cartTotal, lowStockCount } = data;

  // PUNTO DE VENTA (POS)
  if (pathname.startsWith('/pos') || pathname === '/') {
    
    if (cartCount > 0) {
      const isLargeOrder = cartCount >= 5;
      let dynamicTips = [
        "Presiona 'Espacio' o 'Enter' para cobrar rápido",
        "Escanea más productos o usa el buscador (Ctrl+K)"
      ];

      if (isLargeOrder) {
        dynamicTips.push("💡 Orden grande: Verifica cantidades antes de cobrar");
      }
      if (analysis.isRestaurant) {
        dynamicTips.push("🍽️ Tip: Revisa modificadores antes de enviar a cocina");
      }

      return {
        title: isLargeOrder ? "Venta Grande en Curso" : "Registrando Venta",
        message: `${cartCount} artículo${cartCount > 1 ? 's' : ''} | Total: $${cartTotal.toFixed(2)}`,
        tips: dynamicTips,
        icon: "🛒"
      };
    }

    const greetings = {
      morning: "¡Buenos días!",
      afternoon: "¡Buenas tardes!",
      evening: "¡Buenas tardes!",
      night: "Turno nocturno activo"
    };

    const rubroSpecificTips = {
      food_service: [
        "Usa el KDS (Cocina) para ver pedidos en tiempo real",
        "Recuerda actualizar el menú si hay platillos agotados"
      ],
      farmacia: [
        "Verifica caducidades antes de vender",
        "Productos controlados requieren receta"
      ],
      'verduleria/fruteria': [
        "Productos a granel: Registra peso exacto",
        "Actualiza precios si hay cambios del día"
      ],
      apparel: [
        "Escanea etiquetas para control exacto de tallas/colores",
        "Ofrece apartados si el cliente duda"
      ],
      default: [
        "El escáner funciona automáticamente",
      ]
    };

    return {
      title: greetings[timeOfDay],
      message: "Caja lista para vender. Escanea o busca productos para comenzar.",
      tips: rubroSpecificTips[analysis.rubro] || rubroSpecificTips.default,
      icon: "💳"
    };
  }

  // INVENTARIO/PRODUCTOS
  if (pathname.startsWith('/products')) {
    
    if (lowStockCount > 0) {
      const urgency = lowStockCount >= 10 ? "URGENTE" : lowStockCount >= 5 ? "Atención" : "Aviso";
      
      return {
        title: `⚠️ ${urgency}: Stock Bajo`,
        message: `${lowStockCount} producto${lowStockCount > 1 ? 's necesitan' : ' necesita'} reabastecimiento`,
        tips: [
          "Ve a 'Gestionar Lotes' para ver detalles",
          "Genera orden de compra desde Dashboard → Reabastecimiento",
          lowStockCount >= 10 && "💡 Activa alertas automáticas en Configuración"
        ].filter(Boolean),
        icon: "📦"
      };
    }

    const proactiveTips = {
      food_service: [
        "Define recetas para controlar costos de insumos",
        "Marca ingredientes perecederos con caducidad"
      ],
      farmacia: [
        "Configura lotes con caducidad (Normativa COFEPRIS)",
        "Marca controlados para exigir receta"
      ],
      'verduleria/fruteria': [
        "Configura unidad de compra vs venta",
        "Actualiza precios según mercado"
      ],
      apparel: [
        "Usa variantes para control exacto de tallas/colores",
        "Configura SKU únicos"
      ],
      default: [
        "Mantén costos actualizados para utilidad real",
        "Configura mínimos/máximos para alertas"
      ]
    };

    return {
      title: "✅ Inventario Controlado",
      message: "Tu catálogo está en orden. Aprovecha para optimizar.",
      tips: proactiveTips[analysis.rubro] || proactiveTips.default,
      icon: "📊"
    };
  }

  // CLIENTES
  if (pathname.startsWith('/customers')) {
    const { customersWithDebt = 0 } = data;

    if (customersWithDebt > 0) {
      return {
        title: "💰 Control de Crédito",
        message: `${customersWithDebt} cliente${customersWithDebt > 1 ? 's tienen' : ' tiene'} saldo pendiente`,
        tips: [
          "Usa 💵 para registrar abonos parciales",
          "Envía recordatorios por WhatsApp",
          customersWithDebt >= 5 && "📊 Genera reporte de cartera en Dashboard"
        ].filter(Boolean),
        icon: "👥"
      };
    }

    return {
      title: "Cartera de Clientes",
      message: "Administra créditos y fideliza compradores.",
      tips: [
        "Registra teléfono para tickets por WhatsApp",
        "Revisa historial para promociones personalizadas"
      ],
      icon: "🤝"
    };
  }

  // DASHBOARD
  if (pathname.startsWith('/ventas') || pathname.startsWith('/dashboard')) {
    const { licenseDays = 30, statsData = {} } = data;

    if (licenseDays <= 7) {
      return {
        title: licenseDays <= 3 ? "🚨 Licencia por Vencer" : "⏰ Renovación Próxima",
        message: `Tu suscripción expira en ${licenseDays} día${licenseDays > 1 ? 's' : ''}`,
        tips: [
          "Ve a Configuración → Licencia para renovar",
          licenseDays <= 3 && "⚠️ Renueva hoy para evitar interrupciones"
        ].filter(Boolean),
        icon: "🔑"
      };
    }

    const { totalRevenue = 0, totalNetProfit = 0 } = statsData;
    const profitMargin = totalRevenue > 0 ? ((totalNetProfit / totalRevenue) * 100).toFixed(1) : 0;

    if (totalRevenue > 0) {
      return {
        title: "📊 Salud del Negocio",
        message: `Margen: ${profitMargin}% ${profitMargin >= 30 ? '🎉' : profitMargin >= 20 ? '✅' : '⚠️'}`,
        tips: [
          profitMargin < 20 && "💡 Revisa costos de productos con baja ganancia",
          "Analiza qué días vendes más",
          "Verifica caducidades próximas"
        ].filter(Boolean),
        icon: "💹"
      };
    }

    return {
      title: "Dashboard de Negocio",
      message: "Métricas en tiempo real conforme vendas.",
      tips: [
        "Estadísticas actualizadas automáticamente",
        "Usa filtros para comparar periodos"
      ],
      icon: "📈"
    };
  }

  // CAJA
  if (pathname.startsWith('/caja')) {
    const dayType = getDayOfWeek();
    
    return {
      title: "💵 Control de Efectivo",
      message: dayType === 'weekend' 
        ? "Fin de semana - Prevé cambio extra"
        : "Registra entradas/salidas para auditoría",
      tips: [
        "Haz corte al final del turno",
        "Sistema calcula efectivo esperado automáticamente",
        "💡 Descarga respaldo después de cada corte"
      ],
      icon: "💰"
    };
  }

  // PEDIDOS/KDS
  if (pathname.startsWith('/pedidos')) {
    return {
      title: "🍽️ Sistema de Cocina",
      message: "Comandas en tiempo real",
      tips: [
        "Órdenes nuevas suenan automáticamente",
        "Marca 'Listo' cuando termine el platillo",
        "Vista 'Producción' muestra preparación paralela"
      ],
      icon: "👨‍🍳"
    };
  }

  // CONFIGURACIÓN
  if (pathname.startsWith('/configuracion') || pathname.startsWith('/settings')) {
    return {
      title: "⚙️ Configuración",
      message: "Personaliza Lanzo según tu negocio",
      tips: [
        "Haz respaldos semanales",
        "Configura tu rubro para funciones específicas",
        "Cambia tema si trabajas de noche"
      ],
      icon: "🔧"
    };
  }

  // DEFAULT
  const defaultGreetings = {
    morning: { title: "¡Buen día!", message: "Listo para un día productivo" },
    afternoon: { title: "¡Buenas tardes!", message: "El día avanza, ¡sigue así!" },
    evening: { title: "Buenas tardes", message: "Hora pico - mantén el ritmo" },
    night: { title: "Turno Nocturno", message: "Atención especial" }
  };

  return {
    title: defaultGreetings[timeOfDay].title,
    message: defaultGreetings[timeOfDay].message,
    tips: [
      "Navega por el menú lateral",
      "¿Dudas? Revisa 'Acerca de'"
    ],
    icon: "🤖"
  };
};