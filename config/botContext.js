// src/config/botContext.js

export const GLOBAL_ALERT = {
  active: false, 
  id: 'update_v2_repair',
  title: "¡Actualización Importante!",
  message: "Hemos actualizado el sistema...",
  actionLink: "/settings"
};

/**
 * Esta función ahora recibe 'data' con el estado actual de la app
 * (carrito, stock bajo, licencia, etc.)
 */
export const getSmartContext = (pathname, data = {}) => {
  const { cartCount, cartTotal, lowStockCount, licenseDays } = data;

  // 1. RUTA: PUNTO DE VENTA (POS)
  if (pathname.startsWith('/pos')) {
    if (cartCount > 0) {
      return {
        title: "Venta en Curso",
        message: `Tienes ${cartCount} productos en la cuenta. Total actual: $${cartTotal}.`,
        tips: ["Presiona 'Espacio' para cobrar inmediatamente.", "Si el cliente duda, puedes guardar la orden temporalmente."]
      };
    }
    return {
      title: "Modo Caja",
      message: "Todo listo para vender. Usa el escáner o el buscador para empezar.",
      tips: ["Usa F5 si no ves un producto nuevo.", "Puedes crear productos rápidos con el botón '+'."]
    };
  }

  // 2. RUTA: PRODUCTOS / INVENTARIO
  if (pathname.startsWith('/products')) {
    if (lowStockCount > 0) {
      return {
        title: "⚠️ Atención de Stock",
        message: `Detecté ${lowStockCount} productos con stock bajo o agotado.`,
        tips: ["Filtra por 'Por Reabastecer' en la lista.", "Genera una lista de compra desde Reportes."]
      };
    }
    return {
      title: "Inventario Sano",
      message: "Gestiona tu catálogo. Recuerda mantener los costos actualizados para calcular bien tu ganancia.",
      tips: ["Configura 'Lotes' para productos perecederos.", "Usa variantes para ropa o tallas."]
    };
  }

  // 3. RUTA: CLIENTES
  if (pathname.startsWith('/customers')) {
    return {
      title: "Cartera de Clientes",
      message: "Aquí administras los créditos. Un buen control de cobranza es clave para el flujo de efectivo.",
      tips: ["Registra abonos parciales usando el botón de billete.", "Puedes ver el historial de compras de cada cliente."]
    };
  }

  // 4. RUTA: DASHBOARD
  if (pathname.startsWith('/dashboard')) {
    if (licenseDays < 7) {
      return {
        title: "Renovación Próxima",
        message: `Tu licencia vence en ${licenseDays} días. Considera renovar pronto para evitar interrupciones.`,
        tips: ["Ve a Configuración > Licencia para ver detalles."]
      };
    }
    return {
      title: "Resumen del Negocio",
      message: "Aquí tienes la salud de tu negocio en tiempo real.",
      tips: ["Revisa las caducidades próximas.", "Analiza qué días vendes más."]
    };
  }

  // DEFAULT
  return {
    title: "Asistente Lanzo",
    message: "¿En qué puedo ayudarte hoy?",
    tips: ["Navega por el menú lateral.", "Usa el modo oscuro en Configuración si te cansa la vista."]
  };
};