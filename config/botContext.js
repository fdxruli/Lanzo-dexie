// src/utils/botContext.js
// Configuración de contextos del bot según la ruta actual

// 1. Definir la Alerta Global que falta
export const GLOBAL_ALERT = {
  active: false, // Cambiar a true si hay un mensaje urgente
  id: 'maintenance_01',
  message: 'El sistema está operando con normalidad.',
  actionLink: null
};

// 2. Función para obtener acciones rápidas (solicitada por AssistantBot)
export const getQuickActions = (pathname, rubroType = 'general') => {
  // Retornamos acciones genéricas si no hay lógica específica
  return [
    { label: '📦 Productos', path: '/products', icon: '📦' },
    { label: '💰 Caja', path: '/pos', icon: '💰' },
    { label: '👥 Clientes', path: '/customers', icon: '👥' },
    { label: '📊 Reportes', path: '/reports', icon: '📊' }
  ];
};

/**
 * Define el contexto y acciones rápidas del asistente según la página actual
 * @param {string} pathname - Ruta actual de la aplicación
 * @param {object} data - Datos contextuales (carrito, productos, stats, etc.)
 * @returns {object} - Configuración de contexto para el asistente
 */
export const getBotContext = (pathname, data = {}) => {
  const { cart = [], stats = {}, products = [] } = data;

  // 🏠 PÁGINA PRINCIPAL / PUNTO DE VENTA
  if (pathname === '/' || pathname.startsWith('/pos')) {
    const itemsCount = cart.length;
    const hasItems = itemsCount > 0;

    return {
      message: hasItems 
        ? `Tienes ${itemsCount} producto${itemsCount > 1 ? 's' : ''} en el carrito. ¿Necesitas ayuda para finalizar la venta o aplicar descuentos?`
        : 'Estás en el punto de venta. Puedo ayudarte a agregar productos, gestionar el carrito o realizar una venta.',
      actions: [
        {
          label: '📦 Agregar producto',
          icon: '📦',
          route: '/',
          highlight: false
        },
        {
          label: '🎫 Vender fiado',
          icon: '🎫',
          route: '/customers',
          highlight: false
        },
        {
          label: '💰 Ver corte de caja',
          icon: '💰',
          route: '/reports',
          highlight: false
        },
        {
          label: '📊 Ver estadísticas',
          icon: '📊',
          route: '/dashboard',
          highlight: false
        }
      ],
      tips: [
        'Usa el escáner de código de barras para agregar productos rápidamente',
        'Presiona F2 para buscar un producto por nombre',
        'Usa descuentos porcentuales o fijos desde el carrito'
      ]
    };
  }

  // 📦 INVENTARIO
  if (pathname.startsWith('/inventory')) {
    const lowStockCount = products.filter(p => p.stock < 10).length;
    const hasLowStock = lowStockCount > 0;

    return {
      message: hasLowStock
        ? `⚠️ Tienes ${lowStockCount} producto${lowStockCount > 1 ? 's' : ''} con stock bajo (menos de 10 unidades). ¿Necesitas ayuda para hacer un pedido?`
        : 'Estás gestionando tu inventario. Puedo ayudarte a agregar productos, ajustar stock o gestionar lotes.',
      actions: [
        {
          label: '➕ Agregar producto',
          icon: '➕',
          route: '/inventory/add',
          highlight: false
        },
        {
          label: '📋 Ver productos con stock bajo',
          icon: '⚠️',
          route: '/inventory',
          highlight: hasLowStock
        },
        {
          label: '🔄 Ajustar inventario',
          icon: '🔄',
          route: '/inventory/adjust',
          highlight: false
        },
        {
          label: '🏷️ Gestionar lotes',
          icon: '🏷️',
          route: '/inventory/batches',
          highlight: false
        }
      ],
      tips: [
        'Mantén un registro de lotes para productos perecederos',
        'Usa el ajuste de inventario para corregir diferencias',
        'Configura alertas de stock mínimo para cada producto'
      ]
    };
  }

  // 👥 CLIENTES
  if (pathname.startsWith('/customers')) {
    const totalDebt = stats.totalDebt || 0;
    const hasDebt = totalDebt > 0;

    return {
      message: hasDebt
        ? `Hay cuentas pendientes por cobrar por un total de $${totalDebt.toFixed(2)}. ¿Quieres ver el resumen de deudas?`
        : 'Gestiona tus clientes y sus cuentas. Puedo ayudarte a registrar nuevos clientes o revisar cuentas pendientes.',
      actions: [
        {
          label: '👤 Agregar cliente',
          icon: '👤',
          route: '/customers/add',
          highlight: false
        },
        {
          label: '💳 Ver cuentas por cobrar',
          icon: '💳',
          route: '/customers/debts',
          highlight: hasDebt
        },
        {
          label: '📝 Registrar abono',
          icon: '📝',
          route: '/customers',
          highlight: false
        },
        {
          label: '📊 Historial de compras',
          icon: '📊',
          route: '/customers',
          highlight: false
        }
      ],
      tips: [
        'Establece límites de crédito para cada cliente',
        'Envía recordatorios de pago automáticos',
        'Ofrece descuentos por pronto pago'
      ]
    };
  }

  // 📊 REPORTES
  if (pathname.startsWith('/reports')) {
    const todaySales = stats.todaySales || 0;
    const hasSales = todaySales > 0;

    return {
      message: hasSales
        ? `Has vendido $${todaySales.toFixed(2)} hoy. ¿Necesitas generar un reporte o hacer el corte de caja?`
        : 'Revisa tus reportes de ventas, inventario y finanzas. Puedo ayudarte a generar informes o hacer el corte de caja.',
      actions: [
        {
          label: '💰 Corte de caja',
          icon: '💰',
          route: '/reports/cash-close',
          highlight: hasSales
        },
        {
          label: '📈 Reporte de ventas',
          icon: '📈',
          route: '/reports/sales',
          highlight: false
        },
        {
          label: '📦 Reporte de inventario',
          icon: '📦',
          route: '/reports/inventory',
          highlight: false
        },
        {
          label: '💵 Reporte de utilidad',
          icon: '💵',
          route: '/reports/profit',
          highlight: false
        }
      ],
      tips: [
        'Haz el corte de caja al final del día',
        'Compara ventas semanales para identificar tendencias',
        'Exporta reportes en formato Excel o PDF'
      ]
    };
  }

  // ⚙️ CONFIGURACIÓN
  if (pathname.startsWith('/settings')) {
    return {
      message: 'Configura tu sistema según las necesidades de tu negocio. ¿Necesitas ayuda con alguna configuración específica?',
      actions: [
        {
          label: '🏢 Datos de la empresa',
          icon: '🏢',
          route: '/settings/company',
          highlight: false
        },
        {
          label: '💵 Formas de pago',
          icon: '💵',
          route: '/settings/payments',
          highlight: false
        },
        {
          label: '🖨️ Configurar impresora',
          icon: '🖨️',
          route: '/settings/printer',
          highlight: false
        },
        {
          label: '👤 Usuarios y permisos',
          icon: '👤',
          route: '/settings/users',
          highlight: false
        }
      ],
      tips: [
        'Configura tu logotipo para que aparezca en tickets',
        'Define permisos por usuario para mayor seguridad',
        'Activa el backup automático diario'
      ]
    };
  }

  // 📊 DASHBOARD
  if (pathname.startsWith('/dashboard')) {
    const topProduct = stats.topProduct || 'N/A';
    
    return {
      message: `Aquí puedes ver un resumen completo de tu negocio. El producto más vendido es: ${topProduct}.`,
      actions: [
        {
          label: '📈 Ver ventas del mes',
          icon: '📈',
          route: '/reports/sales',
          highlight: false
        },
        {
          label: '💰 Ver utilidades',
          icon: '💰',
          route: '/reports/profit',
          highlight: false
        },
        {
          label: '📦 Productos más vendidos',
          icon: '📦',
          route: '/reports/products',
          highlight: false
        },
        {
          label: '⚠️ Stock bajo',
          icon: '⚠️',
          route: '/inventory',
          highlight: false
        }
      ],
      tips: [
        'Revisa el dashboard cada mañana para planificar el día',
        'Identifica productos de baja rotación para hacer promociones',
        'Compara métricas con el mes anterior'
      ]
    };
  }

  // 🛒 COMPRAS / PROVEEDORES
  if (pathname.startsWith('/purchases')) {
    return {
      message: 'Gestiona tus compras a proveedores. Puedo ayudarte a registrar nuevas compras o revisar cuentas por pagar.',
      actions: [
        {
          label: '🛒 Nueva compra',
          icon: '🛒',
          route: '/purchases/new',
          highlight: false
        },
        {
          label: '👨‍💼 Gestionar proveedores',
          icon: '👨‍💼',
          route: '/purchases/suppliers',
          highlight: false
        },
        {
          label: '💳 Cuentas por pagar',
          icon: '💳',
          route: '/purchases/payables',
          highlight: false
        },
        {
          label: '📊 Historial de compras',
          icon: '📊',
          route: '/purchases/history',
          highlight: false
        }
      ],
      tips: [
        'Registra todas tus compras para control de costos',
        'Negocia mejores precios con proveedores frecuentes',
        'Mantén un calendario de pagos a proveedores'
      ]
    };
  }

  // 🎯 CONTEXTO GENÉRICO (FALLBACK)
  return {
    message: '¡Hola! Soy tu asistente virtual. Estoy aquí para ayudarte con cualquier duda sobre el sistema. ¿En qué puedo asistirte?',
    actions: [
      {
        label: ' Ir a punto de venta',
        icon: '',
        route: '/',
        highlight: false
      },
      {
        label: ' Ver inventario',
        icon: '',
        route: '/inventory',
        highlight: false
      },
      {
        label: ' Ver clientes',
        icon: '',
        route: '/customers',
        highlight: false
      },
      {
        label: ' Ver reportes',
        icon: '',
        route: '/reports',
        highlight: false
      }
    ],
    tips: [
      'Puedes cambiar entre modo claro/oscuro en configuración'
    ]
  };
};

/**
 * Detecta alertas críticas que deben mostrarse con prioridad
 * @param {object} data - Datos del sistema
 * @returns {object|null} - Alerta crítica o null
 */
export const getCriticalAlert = (data = {}) => {
  const { stats = {}, license = {}, products = [] } = data;

  // 1. Licencia próxima a vencer (menos de 7 días)
  if (license.daysRemaining && license.daysRemaining <= 7) {
    return {
      type: 'license',
      severity: license.daysRemaining <= 3 ? 'critical' : 'warning',
      message: `⚠️ Tu licencia vence en ${license.daysRemaining} día${license.daysRemaining > 1 ? 's' : ''}. Renueva ahora para evitar interrupciones.`,
      action: {
        label: 'Renovar licencia',
        route: '/settings/license'
      }
    };
  }

  // 2. Muchos productos con stock bajo (más de 10)
  const lowStockProducts = products.filter(p => p.stock < 10);
  if (lowStockProducts.length > 10) {
    return {
      type: 'inventory',
      severity: 'warning',
      message: `📦 Tienes ${lowStockProducts.length} productos con stock bajo. Es momento de hacer pedidos a tus proveedores.`,
      action: {
        label: 'Ver productos',
        route: '/inventory'
      }
    };
  }

  // 3. Deudas muy altas (más de $10,000)
  if (stats.totalDebt && stats.totalDebt > 10000) {
    return {
      type: 'debt',
      severity: 'warning',
      message: `💳 Tienes cuentas por cobrar por $${stats.totalDebt.toFixed(2)}. Considera hacer recordatorios de pago.`,
      action: {
        label: 'Ver deudas',
        route: '/customers/debts'
      }
    };
  }

  // 4. No se ha hecho backup recientemente (más de 7 días)
  if (stats.lastBackupDays && stats.lastBackupDays > 7) {
    return {
      type: 'backup',
      severity: 'critical',
      message: `⚠️ No has hecho un backup en ${stats.lastBackupDays} días. Es importante respaldar tu información regularmente.`,
      action: {
        label: 'Hacer backup',
        route: '/settings/backup'
      }
    };
  }

  // 5. Diferencias en caja (si el efectivo reportado no coincide)
  if (stats.cashDifference && Math.abs(stats.cashDifference) > 100) {
    return {
      type: 'cash',
      severity: 'critical',
      message: `💰 Hay una diferencia de $${Math.abs(stats.cashDifference).toFixed(2)} en caja. Revisa el corte de caja urgentemente.`,
      action: {
        label: 'Ver corte de caja',
        route: '/reports/cash-close'
      }
    };
  }

  return null;
};

/**
 * Genera sugerencias inteligentes basadas en el contexto actual
 * @param {object} data - Datos del sistema
 * @returns {array} - Lista de sugerencias
 */
export const getSmartSuggestions = (data = {}) => {
  const { stats = {}, products = [], timeOfDay = 'morning' } = data;
  const suggestions = [];

  // Sugerencia basada en hora del día
  if (timeOfDay === 'morning') {
    suggestions.push({
      icon: '☀️',
      text: 'Buenos días. Revisa el reporte de ventas de ayer para planificar el día.',
      action: { label: 'Ver reporte', route: '/reports/sales' }
    });
  } else if (timeOfDay === 'evening') {
    suggestions.push({
      icon: '🌙',
      text: 'Es hora de hacer el corte de caja y cerrar el día.',
      action: { label: 'Corte de caja', route: '/reports/cash-close' }
    });
  }

  // Sugerencia de productos de alta rotación
  if (stats.topProducts && stats.topProducts.length > 0) {
    const topProduct = stats.topProducts[0];
    suggestions.push({
      icon: '⭐',
      text: `Tu producto estrella es "${topProduct.name}". Asegúrate de tener suficiente stock.`,
      action: { label: 'Ver inventario', route: '/inventory' }
    });
  }

  // Sugerencia de análisis de rentabilidad
  if (stats.lowMarginProducts && stats.lowMarginProducts > 0) {
    suggestions.push({
      icon: '📉',
      text: `Tienes ${stats.lowMarginProducts} productos con margen bajo. Considera ajustar precios.`,
      action: { label: 'Revisar precios', route: '/inventory' }
    });
  }

  return suggestions;
};

export const getSmartContext = getBotContext;

export default {
  getBotContext,
  getCriticalAlert,
  getSmartSuggestions
};