// src/App.jsx
import React, { useEffect, lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import ErrorBoundary from './components/common/ErrorBoundary';
import NavigationGuard from './components/common/NavigationGuard';
import Logger from './services/Logger';

// --- COMPONENTES CRÍTICOS (Eager Loading) ---
import Layout from './components/layout/Layout';
import WelcomeModal from './components/common/WelcomeModal';
import RenewalModal from './components/common/RenewalModal';
import SetupModal from './components/common/SetupModal';
import ReconnectionBanner from './components/common/ReconnectionBanner';
import { useSalesStore } from './store/useSalesStore';
import { useSingleInstance } from './hooks/useSingleInstance';
import TermsAndConditionsModal from './components/common/TermsAndConditionsModal';

const MAX_RETRIES = 3;
const RETRY_SESSION_KEY = 'lazy_retry_count';

// --- FUNCIÓN "LAZY" INTELIGENTE ---
const lazyRetry = (importFn, componentName = 'Component') => {
  return lazy(async () => {
    try {
      const component = await importFn();
      // Si carga con éxito, limpiamos el contador de errores
      window.sessionStorage.removeItem(RETRY_SESSION_KEY);
      return component;
    } catch (error) {
      Logger.error(`Error cargando módulo ${componentName}:`, error);

      // 1. Obtener intentos actuales
      const currentRetries = parseInt(window.sessionStorage.getItem(RETRY_SESSION_KEY) || '0', 10);

      // 2. Si no hemos excedido el máximo, recargamos
      if (currentRetries < MAX_RETRIES) {
        window.sessionStorage.setItem(RETRY_SESSION_KEY, (currentRetries + 1).toString());
        Logger.warn(`Reintentando carga (${currentRetries + 1}/${MAX_RETRIES})...`);
        window.location.reload();
        // Retornamos promesa infinita para que React espere al reload
        return new Promise(() => { });
      }

      // 3. SI EXCEDIMOS: Rendirse elegantemente (NO recargar más)
      Logger.error("Máximo de reintentos alcanzado. Mostrando UI de error.");
      window.sessionStorage.removeItem(RETRY_SESSION_KEY); // Limpiar para el futuro

      // Retornamos un componente de error visual en lugar de romper la app
      return {
        default: () => (
          <div style={{
            height: '100vh', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center'
          }}>
            <h2 style={{ fontSize: '2rem' }}>⚠️</h2>
            <h3>Error de conexión</h3>
            <p>No se pudo cargar la sección <strong>{componentName}</strong>.</p>
            <p style={{ fontSize: '0.9rem', color: '#666' }}>Verifica tu internet.</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: '1rem' }}
              onClick={() => window.location.reload()}
            >
              Intentar de nuevo manualmente
            </button>
          </div>
        )
      };
    }
  });
};

const PosPage = lazyRetry(() => import('./pages/PosPage'), 'PosPage');
const CajaPage = lazyRetry(() => import('./pages/CajaPage'), 'CajaPage');
const OrdersPage = lazyRetry(() => import('./pages/OrderPage'), 'OrdersPage');
const ProductsPage = lazyRetry(() => import('./pages/ProductsPage'), 'ProductsPage');
const CustomersPage = lazyRetry(() => import('./pages/CustomersPage'), 'CustomersPage');
const DashboardPage = lazyRetry(() => import('./pages/DashboardPage'), 'DashboardPage');
const SettingsPage = lazyRetry(() => import('./pages/SettingsPage'), 'SettingsPage');
const AboutPage = lazyRetry(() => import('./pages/AboutPage'), 'AboutPage');

const PageLoader = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '50vh', gap: '1rem' }}>
    <div className="loader-spinner"></div>
    <p style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>Cargando módulo...</p>
  </div>
);

function App() {
  const isDuplicate = useSingleInstance();
  const appStatus = useAppStore((state) => state.appStatus);
  const initializeApp = useAppStore((state) => state.initializeApp);
  const pendingTermsUpdate = useAppStore((state) => state.pendingTermsUpdate);
  const clearTermsNotification = () => {
    useAppStore.setState({ pendingTermsUpdate: null });
  };

  // Traemos ambas acciones: Iniciar y Detener
  const startRealtimeSecurity = useAppStore((state) => state.startRealtimeSecurity);
  const stopRealtimeSecurity = useAppStore((state) => state.stopRealtimeSecurity);

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (appStatus === 'ready') {
      startRealtimeSecurity();
    }

    // CLEANUP FUNCTION: Se ejecuta al desmontar o cambiar appStatus
    return () => {
      isMounted = false;
      // Detiene la escucha para liberar memoria y sockets
      stopRealtimeSecurity();
    };
  }, [appStatus, startRealtimeSecurity, stopRealtimeSecurity]);

  useEffect(() => {
    let isReconnecting = false;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        if (isReconnecting) return;
        isReconnecting = true;
        Logger.log("👁️ Pestaña activa: Verificando salud del sistema...");

        // Bandera para controlar si podemos proceder con operaciones de BD
        let dbIsHealthy = false;

        try {
          const { initDB, closeDB, STORES } = await import('./services/database');

          // --- PASO 1 y 2: VERIFICACIÓN NORMAL ---
          const dbInstance = await initDB();

          const healthCheckPromise = new Promise((resolve, reject) => {
            try {
              // ... (tu código existente del healthCheckPromise)
              const tx = dbInstance.transaction([STORES.MENU], 'readonly');
              const store = tx.objectStore(STORES.MENU);
              const request = store.count();
              request.onsuccess = () => resolve(true);
              request.onerror = () => reject(new Error("PING_FAILED"));
              setTimeout(() => reject(new Error("PING_TIMEOUT")), 2000);
            } catch (e) {
              reject(e);
            }
          });

          await healthCheckPromise;
          Logger.log("✅ Conexión a BD verificada y activa.");
          dbIsHealthy = true; // Marcar como saludable

        } catch (error) {
          Logger.warn("⚠️ Conexión inestable detectada:", error.message);
          Logger.log("🔄 Ejecutando reinicio forzado de BD...");

          // --- PASO 3: REINICIO FORZADO ---
          try {
            const { closeDB, initDB } = await import('./services/database');
            closeDB();
            await new Promise(r => setTimeout(r, 500));
            await initDB();
            Logger.log("✅ BD recuperada exitosamente tras reinicio.");
            dbIsHealthy = true; // Recuperación exitosa
          } catch (retryError) {
            Logger.error("💥 Error crítico recuperando BD:", retryError);
            dbIsHealthy = false; // Falló definitivamente

            // Opcional: Forzar recarga si la BD está muerta
            // window.location.reload(); 
          }
        }

        // --- RESTAURACIÓN DE SERVICIOS ---
        // SOLO ejecutar si la BD está saludable
        if (appStatus === 'ready' && dbIsHealthy) { // <--- AQUÍ ESTÁ EL CAMBIO CLAVE
          const { licenseDetails, realtimeSubscription } = useAppStore.getState();

          if (licenseDetails?.license_key && !realtimeSubscription) {
            stopRealtimeSecurity();
            startRealtimeSecurity();
          }

          const lastActive = sessionStorage.getItem('lanzo_last_active');
          const now = Date.now();
          if (!lastActive || (now - parseInt(lastActive)) > 300000) {
            // Solo llamamos a esto si dbIsHealthy es true
            useAppStore.getState().verifySessionIntegrity().catch(Logger.warn);
          }
        }

        isReconnecting = false;
      } else {
        sessionStorage.setItem('lanzo_last_active', Date.now().toString());
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Manejo de BFCache (Back-Forward Cache) para móviles
    const handlePageShow = (event) => {
      if (event.persisted) {
        Logger.log("🔄 Restaurado desde caché, verificando...");
        handleVisibilityChange();
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [appStatus, startRealtimeSecurity, stopRealtimeSecurity]);

  if (isDuplicate) {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px'
      }}>
        <h1 style={{ fontSize: '3rem' }}>⛔</h1>
        <h2>Aplicación ya abierta</h2>
        <p>Lanzo POS ya está abierto en otra pestaña o ventana.</p>
        <p>Por seguridad de tus datos, usa solo una pestaña a la vez.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reintentar (si ya cerraste la otra)
        </button>
      </div>
    );
  }

  switch (appStatus) {
    case 'loading':
      return (
        <div id="app-loader" style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loader-spinner"></div>
        </div>
      );

    case 'unauthenticated':
      return (
        <ErrorBoundary>
          <WelcomeModal />
        </ErrorBoundary>
      );

    case 'setup_required':
      return (
        <ErrorBoundary>
          <SetupModal />
        </ErrorBoundary>
      );

    case 'locked_renewal':
      return (
        <ErrorBoundary>
          <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
            <RenewalModal />
          </div>
        </ErrorBoundary>
      );

    case 'ready':
      return (
        <Suspense fallback={<Layout><PageLoader /></Layout>}>
          <ReconnectionBanner />
          {pendingTermsUpdate && (
            <TermsAndConditionsModal
              isOpen={true}
              onClose={clearTermsNotification}
              isUpdateNotification={true}
            />
          )}
          <NavigationGuard />
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Suspense fallback={<PageLoader />}><PosPage /></Suspense>} />
                <Route path="caja" element={<Suspense fallback={<PageLoader />}><CajaPage /></Suspense>} />
                <Route path='pedidos' element={<Suspense fallback={<PageLoader />}><OrdersPage /></Suspense>} />
                <Route path="productos" element={<Suspense fallback={<PageLoader />}><ProductsPage /></Suspense>} />
                <Route path="clientes" element={<Suspense fallback={<PageLoader />}><CustomersPage /></Suspense>} />
                <Route path="ventas" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
                <Route path="configuracion" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
                <Route path="acerca-de" element={<Suspense fallback={<PageLoader />}><AboutPage /></Suspense>} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </Suspense>
      );

    default:
      return <div>Error al cargar la aplicación.</div>;
  }
}

export default App;