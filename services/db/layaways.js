import { db, STORES } from './dexie';
import { handleDexieError, DatabaseError } from './utils';
// Importamos el repositorio de productos para usar su lógica de deducción blindada
import { productsRepository } from './products';

export const layawayRepository = {

    /**
     * Crear un nuevo apartado y RESERVAR STOCK
     * @param {object} layawayData - Datos del apartado
     * @param {number} initialPayment - Monto del primer abono
     */
    async create(layawayData, initialPayment = 0) {
        try {
            // Transacción RW que abarca Tablas de Apartados, Lotes y Menú
            return await db.transaction('rw', [
                db.table(STORES.LAYAWAYS),
                db.table(STORES.PRODUCT_BATCHES),
                db.table(STORES.MENU)
            ], async () => {

                // 1. PREPARAR DEDUCCIONES DE STOCK
                // Separamos items con lote (Tallas/Colores) de los genéricos
                const batchDeductions = [];
                const genericItems = [];

                layawayData.items.forEach(item => {
                    // Si tiene batchId, es una variante específica (Lógica Apparel)
                    if (item.batchId) {
                        batchDeductions.push({
                            batchId: item.batchId,
                            quantity: item.quantity,
                            reason: `Apartado para ${layawayData.customerName}`
                        });
                    } else {
                        // Producto simple (ej. un accesorio sin variantes)
                        genericItems.push(item);
                    }
                });

                // 2. EJECUTAR DESCUENTO DE LOTES (Usando tu lógica robusta)
                if (batchDeductions.length > 0) {
                    // Esto lanzará error si no hay stock suficiente, abortando toda la transacción
                    await productsRepository.processBatchDeductions(batchDeductions, {
                        validateStock: true, // No permitir apartar lo que no tienes
                        allowPartial: false, // O se aparta todo o nada
                        logDetails: true
                    });
                }

                // 3. EJECUTAR DESCUENTO DE GENÉRICOS (Manual)
                for (const item of genericItems) {
                    // Usamos item.parentId o item.id según corresponda
                    const productId = item.parentId || item.id;
                    const product = await db.table(STORES.MENU).get(productId);

                    if (product && product.trackStock) {
                        if (product.stock < item.quantity) {
                            throw new Error(`Stock insuficiente para: ${product.name}`);
                        }

                        // Actualización directa
                        await db.table(STORES.MENU).update(productId, {
                            stock: product.stock - item.quantity,
                            updatedAt: new Date().toISOString()
                        });
                    }
                }

                // 4. GUARDAR EL APARTADO (Solo si pasamos el filtro de stock)
                const now = new Date().toISOString();
                const newLayaway = {
                    ...layawayData,
                    status: 'active',
                    paidAmount: initialPayment,
                    createdAt: now,
                    updatedAt: now,
                    payments: []
                };

                if (initialPayment > 0) {
                    newLayaway.payments.push({
                        id: crypto.randomUUID(),
                        amount: initialPayment,
                        date: now,
                        type: 'initial_deposit'
                    });
                }

                await db.table(STORES.LAYAWAYS).add(newLayaway);

                return { success: true, layaway: newLayaway };
            });

        } catch (error) {
            // Si falla por stock, el mensaje vendrá claro desde processBatchDeductions
            throw handleDexieError(error, 'Create Layaway');
        }
    },

    /**
     * Cancelar un apartado y DEVOLVER STOCK
     * @param {string} layawayId 
     * @param {string} reason 
     */
    async cancel(layawayId, reason = 'Cancelación por cliente') {
        try {
            return await db.transaction('rw', [
                db.table(STORES.LAYAWAYS),
                db.table(STORES.PRODUCT_BATCHES),
                db.table(STORES.MENU)
            ], async () => {

                const layaway = await db.table(STORES.LAYAWAYS).get(layawayId);
                if (!layaway) throw new Error("Apartado no encontrado");
                if (layaway.status !== 'active') throw new Error("Solo se pueden cancelar apartados activos");

                // Set para saber qué padres necesitan recalculo (optimización)
                const productsToSync = new Set();

                // 1. RESTAURAR STOCK
                for (const item of layaway.items) {

                    // CASO A: Variantes (Lotes - Ropa)
                    if (item.batchId) {
                        const batch = await db.table(STORES.PRODUCT_BATCHES).get(item.batchId);
                        if (batch) {
                            const newStock = batch.stock + item.quantity;
                            await db.table(STORES.PRODUCT_BATCHES).update(item.batchId, {
                                stock: newStock,
                                isActive: true,
                                updatedAt: new Date().toISOString()
                            });
                            // Marcamos el padre para sincronizar después
                            productsToSync.add(batch.productId);
                        }
                    }
                    // CASO B: Genéricos
                    else {
                        const productId = item.parentId || item.id;
                        const product = await db.table(STORES.MENU).get(productId);
                        if (product && product.trackStock) {
                            await db.table(STORES.MENU).update(productId, {
                                stock: product.stock + item.quantity
                            });
                        }
                    }
                }

                // 2. SINCRONIZAR PADRES (Fix para Apparel)
                // Recalculamos el total sumando todos los lotes para que el menú muestre la realidad
                for (const productId of productsToSync) {
                    // Reutilizamos la lógica interna del repositorio de productos
                    // (Si no puedes acceder a saveBatchAndSyncProduct, aquí replicamos lo básico)
                    const allBatches = await db.table(STORES.PRODUCT_BATCHES)
                        .where('productId').equals(productId).toArray();

                    const totalStock = allBatches.reduce((sum, b) =>
                        (b.isActive && b.stock > 0) ? sum + b.stock : sum, 0);

                    await db.table(STORES.MENU).update(productId, {
                        stock: totalStock,
                        updatedAt: new Date().toISOString()
                    });
                }

                // 3. ACTUALIZAR ESTADO
                await db.table(STORES.LAYAWAYS).update(layawayId, {
                    status: 'cancelled',
                    updatedAt: new Date().toISOString(),
                    notes: reason
                });

                return { success: true };
            });
        } catch (error) {
            throw handleDexieError(error, 'Cancel Layaway');
        }
    },

    /**
     * NUEVO: Convierte el apartado en venta histórica.
     * Centraliza la lógica que tenías en el componente UI.
     */
    async convertToSale(layawayId, cashierId = 'system') {
        return await db.transaction('rw', [db.table(STORES.LAYAWAYS), db.table(STORES.SALES)], async () => {
            const layaway = await db.table(STORES.LAYAWAYS).get(layawayId);
            if (!layaway) throw new Error("Apartado no encontrado");

            // Validaciones de negocio
            const pending = layaway.totalAmount - (layaway.paidAmount || 0);
            if (pending > 0.05) throw new Error("El apartado debe estar liquidado para entregar.");

            // 1. Marcar como completado
            await db.table(STORES.LAYAWAYS).update(layawayId, {
                status: 'completed',
                updatedAt: new Date().toISOString(),
                notes: 'Entregado y convertido a venta'
            });

            // 2. Crear venta histórica
            const saleRecord = {
                id: `sale-layaway-${layaway.id}`,
                timestamp: new Date().toISOString(),
                customerId: layaway.customerId,
                customerName: layaway.customerName,
                // Importante: stockManaged: true evita que el sistema de reportes duplique la resta de inventario
                items: layaway.items.map(item => ({
                    ...item,
                    stockManaged: true
                })),
                total: layaway.totalAmount,
                subtotal: layaway.totalAmount,
                discount: 0,
                paymentMethod: 'layaway_completed',
                status: 'completed',
                fulfillmentStatus: 'fulfilled',
                cashierId: cashierId,
                isLayawayConversion: true,
                originalLayawayId: layaway.id
            };

            await db.table(STORES.SALES).add(saleRecord);
            return { success: true, saleId: saleRecord.id };
        });
    },

    async getByCustomer(customerId, onlyActive = true) {
        if (onlyActive) {
            return await db.table(STORES.LAYAWAYS)
                .where('[customerId+status]')
                .equals([customerId, 'active'])
                .toArray();
        }
        return await db.table(STORES.LAYAWAYS).where('customerId').equals(customerId).toArray();
    },

    async getById(id) {
        return await db.table(STORES.LAYAWAYS).get(id);
    },

    async addPayment(layawayId, amount) {
        return await db.transaction('rw', [db.table(STORES.LAYAWAYS)], async () => {
            const layaway = await db.table(STORES.LAYAWAYS).get(layawayId);
            if (!layaway) throw new Error("Apartado no encontrado");

            const newPaidAmount = (layaway.paidAmount || 0) + amount;
            // IMPORTANTE: Permitir margen de error de centavos por punto flotante
            const isFullyPaid = newPaidAmount >= (layaway.totalAmount - 0.01);

            const updates = {
                paidAmount: newPaidAmount,
                updatedAt: new Date().toISOString(),
                // OJO: Si se completa, NO cambiamos a 'completed' aquí automáticamente 
                // porque requerimos un paso final de "Entregar mercancía" o convertir a Venta Real.
                // Lo mantenemos 'active' pero listo para liquidar.
                status: layaway.status
            };

            const newPayments = [...(layaway.payments || []), {
                id: crypto.randomUUID(),
                amount: amount,
                date: new Date().toISOString(),
                type: 'regular_payment'
            }];
            updates.payments = newPayments;

            await db.table(STORES.LAYAWAYS).update(layawayId, updates);
            return { success: true, isFullyPaid, newPaidAmount };
        });
    }
};