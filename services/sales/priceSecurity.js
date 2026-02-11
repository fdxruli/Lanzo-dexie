import {
    PRICE_DRIFT_TOLERANCE,
    TOTAL_DRIFT_TOLERANCE
} from './constants';

export const normalizeAndValidatePricing = async ({
    itemsToProcess,
    total,
    loadData,
    queryBatchesByProductIdAndActive,
    STORES,
    calculateCompositePrice,
    Logger
}) => {
    const uniqueItemIds = [...new Set(itemsToProcess.map(i => i.parentId || i.id))];
    const dbProductsMap = new Map();

    await Promise.all(uniqueItemIds.map(async (id) => {
        const realProduct = await loadData(STORES.MENU, id);
        if (realProduct) {
            if (realProduct.batchManagement?.enabled) {
                const activeBatches = await queryBatchesByProductIdAndActive(id, true);
                realProduct.activeBatches = activeBatches || [];
            }
            dbProductsMap.set(id, realProduct);
        }
    }));

    let securityViolation = false;

    itemsToProcess.forEach((item) => {
        const realId = item.parentId || item.id;
        const dbProduct = dbProductsMap.get(realId);

        if (!dbProduct) {
            throw new Error(`SEGURIDAD: El producto "${item.name}" (ID: ${realId}) no existe en la BD.`);
        }

        const authoritativePrice = calculateCompositePrice(dbProduct, item.quantity);
        const priceDifference = Math.abs(authoritativePrice - parseFloat(item.price));

        if (priceDifference > PRICE_DRIFT_TOLERANCE) {
            Logger.warn(`🛑 ATAQUE DETECTADO: "${item.name}" venía con $${item.price}, real es $${authoritativePrice}.`);
            securityViolation = true;
            item.price = authoritativePrice;
        } else {
            item.price = authoritativePrice;
        }

        item.cost = parseFloat(dbProduct.cost) || 0;
    });

    const calculatedRealTotal = itemsToProcess.reduce((sum, item) => {
        return sum + (item.price * item.quantity);
    }, 0);

    const totalDifference = Math.abs(calculatedRealTotal - parseFloat(total));

    if (securityViolation || totalDifference > TOTAL_DRIFT_TOLERANCE) {
        throw new Error(`⛔ ALERTA DE SEGURIDAD CRÍTICA ⛔\n\nSe detectó una inconsistencia en los precios (Posible manipulación).\n\nTotal Esperado: $${total}\nTotal Real Calculado: $${calculatedRealTotal.toFixed(2)}\n\nLa venta ha sido bloqueada por seguridad. Por favor recarga el carrito.`);
    }
};
