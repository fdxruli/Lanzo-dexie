import { db, STORES } from './dexie';
import { handleDexieError, DatabaseError, DB_ERROR_CODES } from './utils';

/**
 * Repositorio de Ventas.
 * Maneja transacciones críticas de facturación y consistencia de stock.
 */
export const salesRepository = {

    /**
     * Ejecuta una venta de forma Transaccional y Atómica.
     * Actualiza stocks (Lotes y Productos Padre), guarda la venta y genera log.
     * * @param {object} sale - Objeto de venta completo.
     * @param {Array} deductions - Array de { batchId, quantity, productId }.
     */
    async executeSaleTransaction(sale, deductions) {
        try {
            // Definimos las tablas involucradas para bloquearlas (Read-Write)
            return await db.transaction('rw', [
                db.table(STORES.SALES),
                db.table(STORES.PRODUCT_BATCHES),
                db.table(STORES.MENU),
                db.table(STORES.TRANSACTION_LOG)
            ], async () => {

                // 1. Verificación de Idempotencia (Evitar duplicados)
                const existingSale = await db.table(STORES.SALES).get(sale.id);
                if (existingSale) {
                    // Lanzamos error controlado que abortará la transacción
                    throw new DatabaseError(DB_ERROR_CODES.CONSTRAINT_VIOLATION, 'La venta ya fue procesada anteriormente.');
                }

                // 2. Pre-validación y Agrupación de Stocks
                // Mapa para acumular cuánto restar al producto PADRE (Global)
                const parentUpdates = new Map();

                // A. Procesar Deducciones por LOTE (Variantes/Lotes específicos)
                for (const { batchId, quantity, productId } of deductions) {
                    if (quantity <= 0) continue;

                    // Obtener Lote en tiempo real (dentro de la transacción)
                    const batch = await db.table(STORES.PRODUCT_BATCHES).get(batchId);

                    if (!batch) {
                        throw new Error(`Integridad Crítica: El lote ${batchId} no existe.`);
                    }

                    // Validación de Stock (Atomic Check)
                    if (batch.stock < quantity) {
                        throw new Error(`STOCK_INSUFFICIENT: Lote ${batch.sku || batchId} tiene ${batch.stock}, se requiere ${quantity}`);
                    }

                    // Actualizar Lote
                    const newStock = batch.stock - quantity;
                    const updates = {
                        stock: newStock,
                        isActive: newStock > 0.0001 // Desactivar si llega a 0
                    };

                    await db.table(STORES.PRODUCT_BATCHES).update(batchId, updates);

                    // Acumular para el padre
                    const currentParentQty = parentUpdates.get(productId) || 0;
                    parentUpdates.set(productId, currentParentQty + quantity);
                }

                // B. Procesar Items SIN Lote (Productos simples que descuentan directo del padre)
                if (sale.items && Array.isArray(sale.items)) {
                    sale.items.forEach(item => {
                        // Si el item NO usó lotes (es un producto simple), lo sumamos al descuento padre
                        if (!item.batchesUsed || item.batchesUsed.length === 0) {
                            const pid = item.parentId || item.id;
                            if (item.quantity > 0) {
                                const current = parentUpdates.get(pid) || 0;
                                parentUpdates.set(pid, current + item.quantity);
                            }
                        }
                    });
                }

                // 3. Actualizar Productos Padre (Consolidado)
                for (const [productId, qtyToRemove] of parentUpdates) {
                    const product = await db.table(STORES.MENU).get(productId);

                    if (product && product.trackStock) {
                        let newStock = product.stock - qtyToRemove;

                        // --- MEJORA OPCIONAL: BLOQUEO ESTRICTO ---
                        // if (newStock < 0) {
                        //    throw new DatabaseError(DB_ERROR_CODES.CONSTRAINT_VIOLATION, `Stock insuficiente para producto: ${product.name}`);
                        // }
                        // -----------------------------------------

                        if (newStock < 0) newStock = 0; // Tu lógica actual (permisiva)

                        await db.table(STORES.MENU).update(productId, {
                            stock: newStock,
                            updatedAt: new Date().toISOString()
                        });
                    }
                }

                // 4. Guardar la Venta
                // Dexie valida la clave primaria (id) automáticamente
                await db.table(STORES.SALES).add(sale);

                // 5. Registrar Log de Transacción (Para auditoría)
                // Al estar dentro de la transacción, si algo falla arriba, este log NUNCA se escribe.
                // Esto reemplaza la lógica de "PENDING" -> "COMPLETED". Si existe, es que fue exitoso.
                const transactionId = `tx-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
                await db.table(STORES.TRANSACTION_LOG).add({
                    id: transactionId,
                    type: 'SALE',
                    status: 'COMPLETED',
                    timestamp: new Date().toISOString(),
                    amount: sale.total,
                    saleId: sale.id
                });

                return { success: true, transactionId };
            });

        } catch (error) {
            // Manejo especial para errores de negocio (Stock) vs errores técnicos
            if (error.message && error.message.includes('STOCK_INSUFFICIENT')) {
                // Retornamos un error limpio para que el UI muestre alerta sin crashear
                return {
                    success: false,
                    isStockError: true,
                    message: error.message
                };
            }

            throw handleDexieError(error, 'Execute Sale Transaction');
        }
    },

    /**
     * Obtiene ventas desde una fecha específica hasta hoy.
     * Utiliza el índice 'timestamp' para evitar escanear toda la tabla.
     * * @param {string} isoDateString - Fecha de inicio en formato ISO.
     */
    async getOrdersSince(isoDateString) {
        try {
            // aboveOrEqual es el equivalente moderno de IDBKeyRange.lowerBound
            return await db.table(STORES.SALES)
                .where('timestamp').aboveOrEqual(isoDateString)
                .toArray();
        } catch (error) {
            throw handleDexieError(error, 'Get Orders Since');
        }
    },

    /**
     * Obtiene una venta por ID.
     */
    async getSaleById(saleId) {
        try {
            return await db.table(STORES.SALES).get(saleId);
        } catch (error) {
            throw handleDexieError(error, 'Get Sale By ID');
        }
    }
};