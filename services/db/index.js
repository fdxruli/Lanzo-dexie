import { db, STORES } from './dexie';
import { generalRepository } from './general';
import { productsRepository } from './products';
import { salesRepository } from './sales';
import { DatabaseError, DB_ERROR_CODES } from './utils';
import { fixStockInconsistencies, rebuildDailyStats } from '../maintenance';
import { layawayRepository } from './layaways';
import { handleDexieError } from './utils';
import { create } from 'zustand';

// ============================================================
// EXPORTACIÓN DE CONSTANTES Y CLASES (Compatibilidad 100%)
// ============================================================
export { db, STORES, DB_ERROR_CODES, DatabaseError };

// ============================================================
// FUNCIONES DE INICIALIZACIÓN
// ============================================================

export const initDB = async () => {
    // Dexie abre la conexión automáticamente al primer uso (Lazy),
    // pero mantenemos esta función por compatibilidad.
    if (!db.isOpen()) {
        await db.open();
    }
    return db;
};

export const closeDB = () => {
    db.close();
};

// ============================================================
// WRAPPERS "SAFE" (Patrón Adaptador)
// El código antiguo espera { success: true } o { success: false, error }.
// Los nuevos repositorios lanzan excepciones. Aquí hacemos el puente.
// ============================================================

async function safeExecute(operation) {
    try {
        const result = await operation();
        return result ? { success: true, ...result } : { success: true };
    } catch (error) {
        // Obtenemos el mensaje legible
        const errorMessage = error.message || 'Error desconocido';

        // Si ya es un error formateado por nuestros repositorios
        if (error.name === 'DatabaseError') {
            return {
                success: false,
                error,
                message: errorMessage // <--- AGREGA ESTO PARA COMPATIBILIDAD
            };
        }

        // Si es un error desconocido
        const dbError = new DatabaseError(DB_ERROR_CODES.UNKNOWN, errorMessage);
        return {
            success: false,
            error: dbError,
            message: errorMessage // <--- AGREGA ESTO
        };
    }
}

export const saveDataSafe = (storeName, data) =>
    safeExecute(() => generalRepository.save(storeName, data));

export const saveBulkSafe = (storeName, dataArray) =>
    safeExecute(() => generalRepository.saveBulk(storeName, dataArray));

export const deleteDataSafe = (storeName, key) =>
    safeExecute(() => generalRepository.delete(storeName, key));

export const saveBatchAndSyncProductSafe = (batchData) =>
    safeExecute(() => productsRepository.saveBatchAndSyncProduct(batchData));

export const saveBatchAndSyncProduct = saveBatchAndSyncProductSafe;

export const processBatchDeductions = (deductions) =>
    safeExecute(() => productsRepository.processBatchDeductions(deductions));

export const executeSaleTransactionSafe = (sale, deductions) =>
    safeExecute(() => salesRepository.executeSaleTransaction(sale, deductions));

export const layawayRepo = {
    create: (data, initial) => safeExecute(() => layawayRepository.create(data, initial)),
    getByCustomer: (custId, active) => safeExecute(() => layawayRepository.getByCustomer(custId, active)),
    addPayment: (id, amount) => safeExecute(() => layawayRepository.addPayment(id, amount)),
    getById: (id) => safeExecute(() => layawayRepository.getById(id))
};

export const executeBatchWithPaymentSafe = async (batchData, paymentInfo) => {
    return safeExecute(async () => {
        // Bloqueo estricto de tablas: Nadie más puede leer o escribir en estas tablas
        // mientras esta función se esté ejecutando.
        return await db.transaction('rw',
            [
                db.table(STORES.PRODUCT_BATCHES),
                db.table(STORES.MENU),
                db.table(STORES.MOVIMIENTOS_CAJA),
                db.table(STORES.CAJAS),
                db.table(STORES.SALES) // Necesario si vas a recalcular ventas en tiempo real
            ],
            async () => {
                // 1. Obtener la VERDAD ABSOLUTA de la caja en este preciso milisegundo
                const caja = await db.table(STORES.CAJAS).get(paymentInfo.cajaId);
                if (!caja || caja.estado !== 'abierta') {
                    // Si lanzas un error dentro de una transacción en Dexie,
                    // TODO se revierte automáticamente (Rollback automático).
                    throw new Error("Transacción abortada: La caja fue cerrada antes de completar la operación.");
                }

                // 2. CÁLCULO ATÓMICO DEL DINERO DISPONIBLE
                // Importante: Asegúrate de que esta fórmula refleje exactamente tu lógica de negocio real.
                const fondoInicial = Number(caja.monto_inicial || caja.fondo_inicial || 0);
                const ingresosEfectivo = Number(caja.ingresos_efectivo || 0);
                const salidasEfectivo = Number(caja.salidas_efectivo || 0);

                // Si tus ventas no actualizan "ingresos_efectivo" en tiempo real en el objeto caja,
                // tendrías que sumar los ingresos leyendo la tabla STORES.MOVIMIENTOS_CAJA y STORES.SALES aquí mismo.
                const dineroDisponible = fondoInicial + ingresosEfectivo - salidasEfectivo;

                // 3. LA BARRERA INFRANQUEABLE
                if (dineroDisponible < paymentInfo.monto) {
                    throw new Error(`Fondos insuficientes. Intento de retirar $${paymentInfo.monto.toFixed(2)} pero la caja solo cuenta con $${dineroDisponible.toFixed(2)}. Transacción abortada.`);
                }

                // 4. Aplicar el descuento con los datos frescos
                caja.salidas_efectivo = salidasEfectivo + paymentInfo.monto;
                await db.table(STORES.CAJAS).put(caja);

                // 5. Crear el movimiento financiero justificado
                const movimiento = {
                    id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Agrega entropía real
                    caja_id: caja.id,
                    tipo: 'salida',
                    monto: parseFloat(paymentInfo.monto),
                    concepto: paymentInfo.concepto,
                    fecha: new Date().toISOString()
                };
                await db.table(STORES.MOVIMIENTOS_CAJA).put(movimiento);

                // 6. Guardar el lote y sincronizar el producto
                await productsRepository.saveBatchAndSyncProduct(batchData);

                return { success: true, movimiento };
            }
        );
    });
};

export const loadMultipleData = async (storeName, ids) => {
    try {
        if (!db.isOpen()) await db.open();
        return await generalRepository.getMultiple(storeName, ids);
    } catch (error) {
        if (error.name === 'DatabaseClosedError') return null;
        throw error;
    }
};

export const executeProductionBatchSafe = (batchData, recipe) =>
    safeExecute(() => productsRepository.saveProductionBatchAndSync(batchData, recipe));
// ============================================================
// ALIAS DIRECTOS (Lecturas y Búsquedas)
// ============================================================

// CRUD Básico
export const loadData = async (storeName, key = null) => {
    try {
        // 1. Re-intentar abrir si está cerrada (Dexie usualmente auto-abre, 
        // pero si se llamó close() explícitamente, hay que reabrir).
        if (!db.isOpen()) {
            await db.open();
        }

        return key
            ? await generalRepository.getById(storeName, key)
            : await generalRepository.getAll(storeName);

    } catch (error) {
        // 2. Si definitivamente está cerrada o cerrándose, devolvemos null 
        // para no romper la UI.
        if (error.name === 'DatabaseClosedError') {
            console.warn(`[DB] Lectura omitida en ${storeName}: La base de datos está cerrada.`);
            return null;
        }
        throw error; // Otros errores sí los lanzamos
    }
};

export const deleteData = (storeName, key) => generalRepository.delete(storeName, key);
export const saveData = async (storeName, data) => {
    try {
        if (!db.isOpen()) await db.open();
        return await generalRepository.save(storeName, data);
    } catch (error) {
        if (error.name === 'DatabaseClosedError') {
            console.warn(`[DB] Escritura omitida en ${storeName}: La base de datos está cerrada.`);
            return null;
        }
        throw error;
    }
};
export const saveBulk = (storeName, data) => generalRepository.saveBulk(storeName, data);

// Productos e Inventario
export const searchProductByBarcode = productsRepository.searchByBarcode;
export const searchProductsInDB = productsRepository.searchProducts; // Alias para compatibilidad
export const searchProductBySKU = productsRepository.searchProductBySKU;
export const getExpiringBatchesInRange = productsRepository.getExpiringBatches;

// Ventas
export const getOrdersSince = salesRepository.getOrdersSince;

// Papelera
export const recycleData = (sourceStore, trashStore, key, reason) =>
    generalRepository.recycle(sourceStore, trashStore, key, reason);


// ============================================================
// FUNCIONES ESPECIALES (Migradas manualmente aquí)
// ============================================================

/**
 * Paginación manual para tablas grandes
 */
export const loadDataPaginated = async (storeName, options = {}) => {
    // timeIndex se exige desde el invocador, con un fallback genérico a 'createdAt'
    const {
        limit = 50,
        cursor = null,
        searchTerm = '',
        categoryId = null,
        timeIndex = 'createdAt'
    } = options;

    try {
        let query;

        // Se usa estrictamente el timeIndex inyectado para ordenar o paginar
        if (cursor) {
            query = db.table(storeName).where(timeIndex).below(cursor).reverse();
        } else {
            query = db.table(storeName).orderBy(timeIndex).reverse();
        }

        // Filtro en memoria
        query = query.filter(item => {
            if (item.isActive === false) return false;
            if (categoryId && item.categoryId !== categoryId) return false;

            if (searchTerm) {
                const term = searchTerm.toLowerCase().trim();
                const matchName = item.name_lower && item.name_lower.includes(term);
                const matchBarcode = item.barcode && item.barcode.includes(term);
                if (!matchName && !matchBarcode) return false;
            }

            return true;
        });

        const data = await query.limit(limit).toArray();

        // El cursor dinámico respeta el índice declarado
        const nextCursor = data.length === limit ? data[data.length - 1][timeIndex] : null;

        return { data, nextCursor };

    } catch (error) {
        throw handleDexieError(error, `loadDataPaginated ${storeName}`);
    }
};

/**
 * Búsqueda simple por índice
 */
export const queryByIndex = async (storeName, indexName, value) => {
    return await generalRepository.findByIndex(storeName, indexName, value);
};

/**
 * Consulta específica de lotes por producto y estado
 */
export const queryBatchesByProductIdAndActive = async (productId, isActive = true) => {
    return await db.table(STORES.PRODUCT_BATCHES)
        .where('productId').equals(productId)
        .filter(batch => Boolean(batch.isActive) === Boolean(isActive))
        .toArray();
};

/**
 * Eliminación en cascada (Categoría -> Actualizar Productos)
 */
export const deleteCategoryCascading = async (categoryId) => {
    return safeExecute(async () => {
        await db.transaction('rw', [db.table(STORES.CATEGORIES), db.table(STORES.MENU)], async () => {
            // 1. Borrar categoría
            await db.table(STORES.CATEGORIES).delete(categoryId);

            // 2. Buscar productos afectados y quitarles la categoría
            await db.table(STORES.MENU)
                .where('categoryId').equals(categoryId)
                .modify({ categoryId: '' });
        });
    });
};

/**
 * Manejo de Imágenes (Blobs)
 */
export const saveImageToDB = async (id, blob) => {
    try {
        await db.table(STORES.IMAGES).put({ id, blob });
        return true;
    } catch (e) {
        console.error("Error saving image:", e); // <--- Usa tu Logger aquí
        return false;
    }
};

export const getImageFromDB = async (id) => {
    try {
        const record = await db.table(STORES.IMAGES).get(id);
        return record ? record.blob : null;
    } catch (e) {
        return null;
    }
};

/**
 * Verificación de cuota (Storage Manager)
 */
export const checkStorageQuota = async () => {
    if (!navigator.storage || !navigator.storage.estimate) return { warning: false };
    try {
        const estimate = await navigator.storage.estimate();
        const percentUsed = (estimate.usage / estimate.quota) * 100;

        if (percentUsed > 80) {
            return {
                warning: true,
                message: `⚠️ Espacio crítico: ${percentUsed.toFixed(0)}% usado.`
            };
        }
        return { warning: false };
    } catch (e) {
        return { warning: false };
    }
};

/**
 * Recuperación de transacciones (Stub)
 * Dexie maneja la integridad automáticamente, pero dejamos esto
 * para limpiar logs viejos si es necesario.
 */
export const recoverPendingTransactions = async () => {
    try {
        // Buscar logs viejos con PENDING
        const cutoff = Date.now() - 60000; // 1 minuto atrás
        const pending = await db.table(STORES.TRANSACTION_LOG)
            .where('status').equals('PENDING')
            .filter(log => new Date(log.timestamp).getTime() < cutoff)
            .toArray();

        // Marcar como fallidas
        for (const log of pending) {
            await db.table(STORES.TRANSACTION_LOG).update(log.id, {
                status: 'FAILED',
                reason: 'Stale transaction'
            });
        }
    } catch (error) {
        Logger.warn('Recovery skipped:', error);
    }
};

/**
 * Exportar CSV (Stream)
 */
export const streamStoreToCSV = async (storeName, mapFn, onChunk, chunkSize = 500) => {
    let offset = 0;
    let hasMore = true;
    let totalProcessed = 0;

    while (hasMore) {
        const items = await db.table(storeName).offset(offset).limit(chunkSize).toArray();

        if (items.length > 0) {
            const csvChunk = items.map(mapFn).join('\n') + '\n';
            onChunk(csvChunk);
            totalProcessed += items.length;
            offset += chunkSize;
        } else {
            hasMore = false;
        }
    }
    return totalProcessed;
};

/**
 * Archivar datos antiguos
 */
export const archiveOldData = async (monthsToKeep = 6) => {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);
    const isoCutoff = cutoffDate.toISOString();

    // Usamos transacción para mover datos a un JSON en memoria y borrarlos
    return await db.transaction('rw', [db.table(STORES.SALES)], async () => {
        const oldSales = await db.table(STORES.SALES)
            .where('timestamp').below(isoCutoff)
            .toArray();

        if (oldSales.length > 0) {
            // Borrar de la BD
            const idsToDelete = oldSales.map(s => s.id);
            await db.table(STORES.SALES).bulkDelete(idsToDelete);
        }

        return oldSales; // Devolvemos para que la UI los guarde en un archivo
    });
};

/**
 * Exportar TODO a JSONL (Backup)
 */
export const streamAllDataToJSONL = async (onChunk) => {
    const tables = db.tables;

    for (const table of tables) {
        const tableName = table.name;
        let offset = 0;
        const CHUNK_SIZE = 200;

        while (true) {
            const rows = await table.offset(offset).limit(CHUNK_SIZE).toArray();
            if (rows.length === 0) break;

            const chunkString = rows.map(row => JSON.stringify({ s: tableName, d: row })).join('\n') + '\n';
            onChunk(chunkString);

            offset += CHUNK_SIZE;
        }
    }

};

export const maintenanceTools = {
    fixStock: fixStockInconsistencies,
    rebuildStats: rebuildDailyStats
};