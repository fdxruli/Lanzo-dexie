// src/services/botIntelligence.js

import { loadData, STORES } from '../services/db';
import { useOrderStore } from '../store/useOrderStore';
import { useProductStore } from '../store/useProductStore';
import { useAppStore } from '../store/useAppStore';
import { useStatsStore } from '../store/useStatsStore';

/**
 * MOTOR DE INTELIGENCIA DEL BOT
 * Sistema de procesamiento de lenguaje natural y análisis contextual
 */

// ============================================================
// 1. DICCIONARIO DE INTENCIONES (NLP SIMPLIFICADO)
// ============================================================

const INTENT_PATTERNS = {
  // Ventas y Reportes
  sales_report: [
    /cuánto.*vendido/i,
    /ventas.*(?:hoy|día|semana|mes)/i,
    /reporte.*ventas/i,
    /total.*vendido/i,
    /cuántas.*ventas/i
  ],
  
  profit_report: [
    /cuánto.*ganado/i,
    /cuánto.*gané/i,
    /utilidad/i,
    /ganancia/i,
    /cuánto.*dinero.*hice/i
  ],

  // Inventario
  low_stock: [
    /qué.*falta/i,
    /productos.*bajo/i,
    /qué.*pedir/i,
    /stock.*bajo/i,
    /qué.*agotando/i,
    /necesito.*comprar/i
  ],

  product_search: [
    /dónde.*está/i,
    /tengo.*(?:producto|item)/i,
    /hay.*(?:producto|stock)/i,
    /cuánto.*(?:tengo|queda)/i,
    /buscar.*producto/i
  ],

  expiration_alert: [
    /qué.*caduca/i,
    /productos.*venc/i,
    /fecha.*vencimiento/i,
    /caducidad/i
  ],

  // Clientes
  customer_debt: [
    /quién.*debe/i,
    /cuánto.*debe/i,
    /clientes.*deud/i,
    /cobrar.*pendiente/i,
    /fiado/i
  ],

  // Ayuda y Tutoriales
  help_general: [
    /cómo.*(?:uso|funciona)/i,
    /ayuda/i,
    /no.*sé/i,
    /qué.*puedo.*hacer/i,
    /tutorial/i
  ],

  help_product: [
    /cómo.*(?:agregar|crear).*producto/i,
    /añadir.*producto/i,
    /registrar.*producto/i
  ],

  help_sale: [
    /cómo.*vender/i,
    /hacer.*venta/i,
    /cobrar/i,
    /procesar.*pago/i
  ],

  // Análisis de negocio
  best_sellers: [
    /qué.*vende.*más/i,
    /productos.*populares/i,
    /más.*vendido/i,
    /top.*productos/i
  ],

  slow_movers: [
    /qué.*no.*vende/i,
    /productos.*lentos/i,
    /qué.*eliminar/i,
    /qué.*no.*rota/i
  ],

  // Configuración
  backup_help: [
    /cómo.*respaldar/i,
    /backup/i,
    /guardar.*datos/i,
    /exportar/i
  ],

  // Problemas comunes
  troubleshoot_stock: [
    /stock.*incorrecto/i,
    /inventario.*mal/i,
    /números.*no.*cuadran/i,
    /desincronizado/i
  ]
};

// ============================================================
// 2. ANALIZADOR DE INTENCIONES
// ============================================================

export const detectIntent = (userMessage) => {
  const message = userMessage.toLowerCase().trim();
  
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return intent;
      }
    }
  }
  
  return 'unknown';
};

// ============================================================
// 3. EXTRACTOR DE ENTIDADES (Fechas, Números, Productos)
// ============================================================

export const extractEntities = (message) => {
  const entities = {
    timeframe: null,
    productName: null,
    customerName: null,
    amount: null
  };

  // Detectar período de tiempo
  if (/hoy/i.test(message)) entities.timeframe = 'today';
  else if (/ayer/i.test(message)) entities.timeframe = 'yesterday';
  else if (/semana/i.test(message)) entities.timeframe = 'week';
  else if (/mes/i.test(message)) entities.timeframe = 'month';

  // Extraer nombres de productos (palabras entre comillas o capitalizadas)
  const productMatch = message.match(/"([^"]+)"/);
  if (productMatch) entities.productName = productMatch[1];

  // Extraer cantidades
  const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
  if (amountMatch) entities.amount = parseFloat(amountMatch[1]);

  return entities;
};

// ============================================================
// 4. CALCULADORES DE DATOS
// ============================================================

export const calculateSalesReport = async (timeframe = 'today') => {
  const sales = await loadData(STORES.SALES);
  const now = new Date();
  let startDate = new Date();

  switch (timeframe) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'week':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
  }

  const filteredSales = sales.filter(s => {
    const saleDate = new Date(s.timestamp);
    return saleDate >= startDate && saleDate <= now && s.fulfillmentStatus !== 'cancelled';
  });

  const total = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const count = filteredSales.length;

  let profit = 0;
  filteredSales.forEach(sale => {
    if (sale.items) {
      sale.items.forEach(item => {
        const cost = item.cost || 0;
        const price = item.price || 0;
        const qty = item.quantity || 0;
        profit += (price - cost) * qty;
      });
    }
  });

  return { total, count, profit, timeframe };
};

export const getLowStockProducts = async () => {
  const products = await loadData(STORES.MENU);
  
  return products
    .filter(p => 
      p.isActive !== false &&
      p.trackStock &&
      p.minStock > 0 &&
      p.stock <= p.minStock
    )
    .sort((a, b) => {
      const urgencyA = a.stock / (a.minStock || 1);
      const urgencyB = b.stock / (b.minStock || 1);
      return urgencyA - urgencyB;
    })
    .slice(0, 10);
};

export const getExpiringProducts = async (daysThreshold = 7) => {
  const products = await loadData(STORES.MENU);
  const today = new Date();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + daysThreshold);

  return products
    .filter(p => {
      if (!p.shelfLife || !p.isActive) return false;
      const expiryDate = new Date(p.shelfLife);
      return expiryDate <= threshold && expiryDate >= today;
    })
    .sort((a, b) => new Date(a.shelfLife) - new Date(b.shelfLife))
    .slice(0, 10);
};

export const getCustomersWithDebt = async () => {
  const customers = await loadData(STORES.CUSTOMERS);
  
  return customers
    .filter(c => c.debt > 0)
    .sort((a, b) => b.debt - a.debt)
    .slice(0, 10);
};

export const searchProductByName = async (productName) => {
  const products = await loadData(STORES.MENU);
  const searchTerm = productName.toLowerCase();
  
  return products.find(p => 
    p.name.toLowerCase().includes(searchTerm) ||
    p.barcode === searchTerm
  );
};

export const getTopProducts = async (timeframe = 'month', limit = 10) => {
  const sales = await loadData(STORES.SALES);
  const now = new Date();
  let startDate = new Date();

  switch (timeframe) {
    case 'week':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
  }

  const productSales = new Map();

  sales.forEach(sale => {
    const saleDate = new Date(sale.timestamp);
    if (saleDate >= startDate && sale.fulfillmentStatus !== 'cancelled') {
      sale.items?.forEach(item => {
        const key = item.name;
        const current = productSales.get(key) || { name: key, quantity: 0, revenue: 0 };
        current.quantity += item.quantity || 0;
        current.revenue += (item.price * item.quantity) || 0;
        productSales.set(key, current);
      });
    }
  });

  return Array.from(productSales.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
};

// ============================================================
// 5. GENERADOR DE RESPUESTAS INTELIGENTES
// ============================================================

export const generateResponse = async (intent, entities, context) => {
  const responses = {
    sales_report: async () => {
      const report = await calculateSalesReport(entities.timeframe || 'today');
      const periodText = {
        today: 'hoy',
        yesterday: 'ayer',
        week: 'esta semana',
        month: 'este mes'
      }[report.timeframe];

      return {
        title: `📊 Ventas ${periodText}`,
        message: `Has vendido **$${report.total.toFixed(2)}** en ${report.count} transacción${report.count !== 1 ? 'es' : ''}.`,
        tips: [
          `Ganancia neta: $${report.profit.toFixed(2)}`,
          `Promedio por venta: $${(report.total / (report.count || 1)).toFixed(2)}`
        ],
        actions: [
          { label: 'Ver Historial Completo', path: '/ventas', icon: '📈' }
        ]
      };
    },

    profit_report: async () => {
      const stats = useStatsStore.getState().stats;
      return {
        title: '💰 Reporte de Ganancias',
        message: `Tu utilidad neta total es de **$${stats.totalNetProfit.toFixed(2)}**.`,
        tips: [
          `Valor de inventario: $${stats.inventoryValue.toFixed(2)}`,
          `Ventas totales: $${stats.totalRevenue.toFixed(2)}`
        ],
        actions: [
          { label: 'Ver Dashboard', path: '/ventas', icon: '📊' }
        ]
      };
    },

    low_stock: async () => {
      const lowStock = await getLowStockProducts();
      
      if (lowStock.length === 0) {
        return {
          title: '✅ Inventario Saludable',
          message: 'No hay productos con stock bajo en este momento.',
          tips: ['Revisa tu inventario regularmente para mantener este estado'],
          actions: []
        };
      }

      const topUrgent = lowStock.slice(0, 3)
        .map(p => `• ${p.name}: ${p.stock} ${p.saleType === 'bulk' ? 'kg' : 'pzs'} (Min: ${p.minStock})`)
        .join('\n');

      return {
        title: '⚠️ Stock Bajo Detectado',
        message: `Hay **${lowStock.length} producto${lowStock.length !== 1 ? 's' : ''}** que necesitan reabastecimiento:\n\n${topUrgent}`,
        tips: ['Ve a la sección de Reabastecimiento para generar orden de compra'],
        actions: [
          { label: 'Ver Lista Completa', path: '/ventas?tab=restock', icon: '📦', highlight: true }
        ]
      };
    },

    product_search: async () => {
      if (!entities.productName) {
        return {
          title: '🔍 Búsqueda de Productos',
          message: 'Puedes buscar cualquier producto desde la sección de Inventario.',
          tips: ['Usa el escáner de código de barras para búsquedas rápidas'],
          actions: [
            { label: 'Ir a Inventario', path: '/productos', icon: '📦' }
          ]
        };
      }

      const product = await searchProductByName(entities.productName);
      
      if (!product) {
        return {
          title: '❌ Producto No Encontrado',
          message: `No encontré "${entities.productName}" en tu inventario.`,
          tips: ['Verifica la ortografía o busca por código de barras'],
          actions: [
            { label: 'Agregar Nuevo Producto', path: '/productos?tab=add', icon: '➕' }
          ]
        };
      }

      return {
        title: `✅ ${product.name}`,
        message: `Stock actual: **${product.stock}** ${product.saleType === 'bulk' ? 'kg' : 'piezas'}\nPrecio: $${product.price.toFixed(2)}`,
        tips: [
          product.trackStock && product.stock <= (product.minStock || 5) 
            ? '⚠️ Stock bajo, considera reabastecer'
            : '✓ Stock saludable'
        ],
        actions: [
          { label: 'Ver Detalles', path: '/productos', icon: '🔍' }
        ]
      };
    },

    customer_debt: async () => {
      const debtors = await getCustomersWithDebt();
      
      if (debtors.length === 0) {
        return {
          title: '✅ Sin Deudas Pendientes',
          message: 'No hay clientes con saldo pendiente.',
          tips: [],
          actions: []
        };
      }

      const totalDebt = debtors.reduce((sum, c) => sum + c.debt, 0);
      const topDebtors = debtors.slice(0, 3)
        .map(c => `• ${c.name}: $${c.debt.toFixed(2)}`)
        .join('\n');

      return {
        title: '💳 Cuentas por Cobrar',
        message: `Tienes **$${totalDebt.toFixed(2)}** pendientes de cobro.\n\nTop 3:\n${topDebtors}`,
        tips: ['Envía recordatorios por WhatsApp desde la sección de Clientes'],
        actions: [
          { label: 'Ver Todos los Clientes', path: '/clientes', icon: '👥', highlight: true }
        ]
      };
    },

    best_sellers: async () => {
      const topProducts = await getTopProducts('month', 5);
      
      if (topProducts.length === 0) {
        return {
          title: '📊 Productos Más Vendidos',
          message: 'Aún no hay suficientes datos de ventas.',
          tips: [],
          actions: []
        };
      }

      const list = topProducts
        .map((p, i) => `${i + 1}. ${p.name} (${p.quantity} vendidos - $${p.revenue.toFixed(2)})`)
        .join('\n');

      return {
        title: '🏆 Top 5 Productos del Mes',
        message: list,
        tips: ['Asegúrate de tener buen stock de estos productos'],
        actions: [
          { label: 'Ver Análisis Completo', path: '/ventas', icon: '📈' }
        ]
      };
    },

    help_general: () => {
      return {
        title: '❓ Centro de Ayuda',
        message: 'Puedo ayudarte con:\n\n• Reportes de ventas y ganancias\n• Alertas de inventario\n• Búsqueda de productos\n• Análisis de clientes\n• Tutoriales paso a paso',
        tips: [
          'Pregúntame cosas como: "¿Cuánto vendí hoy?" o "¿Qué productos están por caducar?"'
        ],
        actions: [
          { label: 'Ver Tutoriales', path: '/acerca-de', icon: '📚' }
        ]
      };
    },

    help_product: () => {
      return {
        title: '📦 Cómo Agregar Productos',
        message: '1. Ve a la pestaña "Productos"\n2. Click en "Añadir Producto"\n3. Llena la información básica\n4. Guarda',
        tips: [
          'Usa el escáner para capturar códigos de barras rápidamente',
          'Configura stock mínimo para alertas automáticas'
        ],
        actions: [
          { label: 'Ir a Agregar Producto', path: '/productos?tab=add', icon: '➕', highlight: true }
        ]
      };
    },

    help_sale: () => {
      return {
        title: '💰 Cómo Hacer una Venta',
        message: '1. Escanea o busca productos\n2. Ajusta cantidades\n3. Click en "Cobrar"\n4. Ingresa el pago recibido',
        tips: [
          'Usa Espacio o Enter para procesar rápido',
          'Puedes vender a crédito registrando al cliente'
        ],
        actions: [
          { label: 'Ir al POS', path: '/', icon: '🛒', highlight: true }
        ]
      };
    },

    backup_help: () => {
      return {
        title: '💾 Respaldos de Seguridad',
        message: 'Es vital hacer copias de seguridad semanales.\n\nVe a Configuración → Datos y Mantenimiento → Respaldar Datos',
        tips: [
          'Guarda el archivo en la nube (Drive, Dropbox)',
          'Haz respaldos antes de actualizar el sistema'
        ],
        actions: [
          { label: 'Ir a Configuración', path: '/configuracion?tab=maintenance', icon: '⚙️', highlight: true }
        ]
      };
    },

    troubleshoot_stock: () => {
      return {
        title: '🔧 Reparar Inventario',
        message: 'Si tus stocks no cuadran, usa la herramienta de sincronización:\n\nConfigu ración → Mantenimiento → Sincronizar Stock',
        tips: [
          'Esto recalcula todos los stocks basándose en los lotes',
          'Haz un respaldo antes de ejecutar reparaciones'
        ],
        actions: [
          { label: 'Ir a Mantenimiento', path: '/configuracion?tab=maintenance', icon: '🛠️', highlight: true }
        ]
      };
    },

    unknown: () => {
      return {
        title: '🤔 No Entendí Bien',
        message: 'Intenta preguntar de otra forma. Por ejemplo:\n\n• "¿Cuánto vendí hoy?"\n• "¿Qué productos están por agotarse?"\n• "¿Quién me debe dinero?"',
        tips: [],
        actions: [
          { label: 'Ver Qué Puedo Hacer', path: '/acerca-de', icon: '❓' }
        ]
      };
    }
  };

  const handler = responses[intent] || responses.unknown;
  return await handler();
};

// ============================================================
// 6. SISTEMA DE SUGERENCIAS PROACTIVAS
// ============================================================

export const getProactiveSuggestions = async (context) => {
  const suggestions = [];
  const now = new Date();
  const hour = now.getHours();

  // Sugerencia: Hacer respaldo (Viernes tarde)
  if (now.getDay() === 5 && hour >= 16) {
    const lastBackup = localStorage.getItem('last_backup_date');
    const lastDate = lastBackup ? new Date(lastBackup) : null;
    
    if (!lastDate || (now - lastDate) > 7 * 24 * 60 * 60 * 1000) {
      suggestions.push({
        type: 'backup',
        priority: 'high',
        message: '💾 Es viernes, ¿ya respaldaste tus datos de la semana?',
        action: { label: 'Respaldar Ahora', path: '/configuracion?tab=maintenance' }
      });
    }
  }

  // Sugerencia: Revisar caducidades (Lunes mañana)
  if (now.getDay() === 1 && hour >= 8 && hour <= 10) {
    const expiring = await getExpiringProducts(7);
    if (expiring.length > 0) {
      suggestions.push({
        type: 'expiration',
        priority: 'medium',
        message: `⚠️ Hay ${expiring.length} producto(s) por caducar esta semana`,
        action: { label: 'Ver Lista', path: '/ventas?tab=expiration' }
      });
    }
  }

  // Sugerencia: Revisar stock bajo (Después de 10 ventas)
  const cartItems = useOrderStore.getState().order.length;
  if (cartItems === 0) {
    const salesCount = (await loadData(STORES.SALES)).length;
    if (salesCount % 10 === 0 && salesCount > 0) {
      const lowStock = await getLowStockProducts();
      if (lowStock.length > 0) {
        suggestions.push({
          type: 'restock',
          priority: 'medium',
          message: `📦 ${lowStock.length} producto(s) necesitan reabastecimiento`,
          action: { label: 'Ver Qué Pedir', path: '/ventas?tab=restock' }
        });
      }
    }
  }

  return suggestions.sort((a, b) => {
    const priority = { high: 3, medium: 2, low: 1 };
    return priority[b.priority] - priority[a.priority];
  })[0]; // Retornar solo la más importante
};