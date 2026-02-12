import React, { useState } from 'react';
import { processSale } from '../../services/salesService';
import {
    initDB,
    saveData,
    loadData,
    deleteData,
    saveBatchAndSyncProduct,
    STORES
} from '../../services/db/index';

const SalesSystemTester = () => {
    const [logs, setLogs] = useState([]);
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState(0);

    // Identificadores constantes para los datos de prueba
    const TEST_IDS = {
        CUSTOMER: 'TEST_SYS_CUSTOMER',
        ING_HARINA: 'TEST_SYS_ING_HARINA',
        ING_TOMATE: 'TEST_SYS_ING_TOMATE',
        PROD_PIZZA: 'TEST_SYS_PROD_PIZZA',
        PROD_MEDICINA: 'TEST_SYS_PROD_MEDICINA',
        BATCH_HARINA: 'TEST_SYS_BATCH_HARINA',
        BATCH_TOMATE: 'TEST_SYS_BATCH_TOMATE',
        BATCH_MED: 'TEST_SYS_BATCH_MED'
    };

    const addLog = (message, type = 'info') => {
        setLogs(prev => [...prev, { id: Date.now() + Math.random(), message, type }]);
        const el = document.getElementById('sales-test-log');
        if (el) setTimeout(() => el.scrollTop = el.scrollHeight, 50);
    };

    const assert = (condition, successMsg, failMsg) => {
        if (condition) {
            addLog(`✅ ${successMsg}`, 'success');
            return true;
        } else {
            addLog(`❌ FALLO: ${failMsg}`, 'error');
            throw new Error(failMsg);
        }
    };

    const cleanEnvironment = async () => {
        addLog("🧹 Limpiando datos de prueba anteriores...", 'info');
        try {
            await deleteData(STORES.CUSTOMERS, TEST_IDS.CUSTOMER);
            await deleteData(STORES.MENU, TEST_IDS.ING_HARINA);
            await deleteData(STORES.MENU, TEST_IDS.ING_TOMATE);
            await deleteData(STORES.MENU, TEST_IDS.PROD_PIZZA);
            await deleteData(STORES.MENU, TEST_IDS.PROD_MEDICINA);
            await deleteData(STORES.PRODUCT_BATCHES, TEST_IDS.BATCH_HARINA);
            await deleteData(STORES.PRODUCT_BATCHES, TEST_IDS.BATCH_TOMATE);
            await deleteData(STORES.PRODUCT_BATCHES, TEST_IDS.BATCH_MED);
        } catch (e) {
            console.warn("Limpieza no crítica:", e);
        }
    };

    const runSystemCheck = async () => {
        setIsRunning(true);
        setLogs([]);
        setProgress(0);

        try {
            await initDB();
            await cleanEnvironment();

            addLog("🚀 INICIANDO TEST DEL CORE DE VENTAS...", 'info');

            // ----------------------------------------------------------------
            // 1. PREPARACIÓN DE DATOS (Recetas y Lotes)
            // ----------------------------------------------------------------
            addLog("--- 1. CONFIGURACIÓN DE ECOSISTEMA ---", 'info');

            // Crear Ingredientes
            await saveData(STORES.MENU, { id: TEST_IDS.ING_HARINA, name: "Harina Test", trackStock: true, price: 0 });
            await saveData(STORES.MENU, { id: TEST_IDS.ING_TOMATE, name: "Tomate Test", trackStock: true, price: 0 });

            // Crear Lotes (Stock Inicial: Harina=100, Tomate=50)
            await saveBatchAndSyncProduct({
                id: TEST_IDS.BATCH_HARINA, productId: TEST_IDS.ING_HARINA, stock: 100, cost: 10, isActive: true
            });
            await saveBatchAndSyncProduct({
                id: TEST_IDS.BATCH_TOMATE, productId: TEST_IDS.ING_TOMATE, stock: 50, cost: 5, isActive: true
            });

            // Crear Producto Compuesto (Pizza = 2 Harina + 1 Tomate)
            const pizzaProd = {
                id: TEST_IDS.PROD_PIZZA,
                name: "Pizza Especial Test",
                price: 100,
                trackStock: false,
                recipe: [
                    { ingredientId: TEST_IDS.ING_HARINA, quantity: 2 },
                    { ingredientId: TEST_IDS.ING_TOMATE, quantity: 1 }
                ]
            };
            await saveData(STORES.MENU, pizzaProd);

            // Crear Producto Controlado (Farmacia)
            const medProd = {
                id: TEST_IDS.PROD_MEDICINA,
                name: "Antibiótico Controlado",
                price: 200,
                trackStock: true,
                requiresPrescription: true // <--- Flag clave
            };
            await saveData(STORES.MENU, medProd);
            await saveBatchAndSyncProduct({
                id: TEST_IDS.BATCH_MED, productId: TEST_IDS.PROD_MEDICINA, stock: 10, cost: 50, isActive: true
            });

            addLog("📦 Datos maestros creados correctamente.", 'success');
            setProgress(30);

            // ----------------------------------------------------------------
            // 2. TEST DE VALIDACIÓN (Reglas de Negocio)
            // ----------------------------------------------------------------
            addLog("--- 2. TEST VALIDACIONES DE NEGOCIO ---", 'info');

            // Cargamos todos los productos para simular el store
            const allProducts = [
                await loadData(STORES.MENU, TEST_IDS.ING_HARINA),
                await loadData(STORES.MENU, TEST_IDS.ING_TOMATE),
                await loadData(STORES.MENU, TEST_IDS.PROD_PIZZA),
                await loadData(STORES.MENU, TEST_IDS.PROD_MEDICINA)
            ];

            // 2.1 Intentar vender antibiótico SIN receta (Debe fallar)
            const resultBlocked = await processSale({
                order: [{ id: TEST_IDS.PROD_MEDICINA, quantity: 1, price: 200 }],
                paymentData: { amountPaid: 200, paymentMethod: 'cash' },
                total: 200,
                allProducts,
                features: { hasLabFields: true }, // Simulamos modo farmacia
                companyName: "Test Lab"
            });

            assert(resultBlocked.success === false,
                "Bloqueo de antibiótico s/receta funcionó correctamente",
                "ERROR GRAVE: Se permitió vender controlado sin receta");

            // 2.2 Intentar vender MÁS de lo que hay en stock (Pizza)
            // Necesitamos: 60 Pizzas * 1 Tomate = 60 Tomates (Solo hay 50)
            const resultStock = await processSale({
                order: [{ id: TEST_IDS.PROD_PIZZA, quantity: 60, price: 100 }],
                paymentData: { amountPaid: 6000, paymentMethod: 'cash' },
                total: 6000,
                allProducts,
                features: { hasRecipes: true }
            });

            assert(resultStock.success === false && resultStock.errorType === 'STOCK_WARNING',
                "Validación de Stock Insuficiente correcta",
                "ERROR: El sistema permitió vender sin stock de ingredientes");

            setProgress(60);

            // ----------------------------------------------------------------
            // 3. TEST DE VENTA EXITOSA Y DEDUCCIÓN
            // ----------------------------------------------------------------
            addLog("--- 3. TEST FLUJO EXITOSO Y DEDUCCIÓN ---", 'info');

            // Vender 10 Pizzas
            // Consumo esperado: 
            // - Harina: 10 * 2 = 20 unidades (Stock final debe ser 100 - 20 = 80)
            // - Tomate: 10 * 1 = 10 unidades (Stock final debe ser 50 - 10 = 40)

            const successfulSale = await processSale({
                order: [{ id: TEST_IDS.PROD_PIZZA, parentId: TEST_IDS.PROD_PIZZA, quantity: 10, price: 100 }],
                paymentData: {
                    customerId: 'GENERIC',
                    paymentMethod: 'cash',
                    amountPaid: 1000,
                    saldoPendiente: 0
                },
                total: 1000,
                allProducts,
                features: { hasRecipes: true, hasKDS: false },
                companyName: "Test Pitufo"
            });

            assert(successfulSale.success === true,
                "Venta procesada exitosamente",
                `Fallo al procesar venta válida: ${successfulSale.message}`);

            // Verificar saldos en DB
            const harinaFinal = await loadData(STORES.MENU, TEST_IDS.ING_HARINA);
            const tomateFinal = await loadData(STORES.MENU, TEST_IDS.ING_TOMATE);

            assert(harinaFinal.stock === 80,
                `Stock Harina descontado correctamente (100 -> 80)`,
                `Error en descuento Harina. Esperado: 80, Actual: ${harinaFinal.stock}`);

            assert(tomateFinal.stock === 40,
                `Stock Tomate descontado correctamente (50 -> 40)`,
                `Error en descuento Tomate. Esperado: 40, Actual: ${tomateFinal.stock}`);

            setProgress(100);
            addLog("🎉 TODO EL SISTEMA DE VENTAS OPERA AL 100%", 'success');

            // Limpieza final opcional (puedes comentarla para inspeccionar la DB manualmente)
            await cleanEnvironment();

        } catch (error) {
            console.error(error);
            addLog(`❌ EXCEPCIÓN NO CONTROLADA: ${error.message}`, 'error');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'monospace' }}>
            <div style={{ marginBottom: '20px', borderBottom: '2px solid #3b82f6', paddingBottom: '15px' }}>
                <h2 style={{ margin: 0, color: '#1e40af' }}>🧪 Sales Service Integration Test</h2>
                <p style={{ color: '#64748b', marginTop: '5px' }}>
                    Verifica: `salesService.js` ↔ `processSaleCore.js` ↔ `stockValidation.js`
                </p>
            </div>

            <button
                onClick={runSystemCheck}
                disabled={isRunning}
                style={{
                    padding: '12px 24px',
                    backgroundColor: isRunning ? '#94a3b8' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                    width: '100%',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
            >
                {isRunning ? '⚡ Ejecutando Pruebas...' : '▶ EJECUTAR TEST DE VENTAS'}
            </button>

            <div style={{
                width: '100%', height: '10px', backgroundColor: '#e2e8f0',
                marginTop: '20px', borderRadius: '5px', overflow: 'hidden'
            }}>
                <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    backgroundColor: progress === 100 ? '#22c55e' : '#3b82f6',
                    transition: 'width 0.4s ease'
                }} />
            </div>

            <div
                id="sales-test-log"
                style={{
                    marginTop: '20px',
                    backgroundColor: '#0f172a',
                    color: '#e2e8f0',
                    padding: '20px',
                    borderRadius: '12px',
                    height: '450px',
                    overflowY: 'auto',
                    border: '1px solid #334155',
                    fontFamily: '"Consolas", "Monaco", monospace',
                    fontSize: '14px'
                }}
            >
                {logs.length === 0 && <div style={{ color: '#64748b', textAlign: 'center', marginTop: '180px' }}>Listo para iniciar diagnóstico...</div>}

                {logs.map(log => (
                    <div key={log.id} style={{ marginBottom: '8px', display: 'flex', gap: '10px' }}>
                        <span style={{ color: '#64748b', minWidth: '85px', fontSize: '12px', paddingTop: '2px' }}>
                            {new Date(log.id).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span style={{
                            color: log.type === 'success' ? '#4ade80' :
                                log.type === 'error' ? '#f87171' : '#bfdbfe',
                            flex: 1
                        }}>
                            {log.message}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SalesSystemTester;