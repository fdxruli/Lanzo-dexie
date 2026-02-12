// services/sales/stockValidation.js - VERSIÓN CORREGIDA
// ✅ Restaura la detección de ingredientes eliminados (fantasma)

export const validateStockBeforeSale = async ({
    itemsToProcess,
    productMap,
    features,
    ignoreStock,
    loadData,
    STORES
}) => {
    if (!features.hasRecipes || ignoreStock) {
        return { ok: true };
    }

    const uniqueIngredientIds = new Set();

    itemsToProcess.forEach(item => {
        const realId = item.parentId || item.id;
        const productDef = productMap.get(realId);

        if (productDef?.recipe?.length > 0) {
            productDef.recipe.forEach(ing => {
                if (ing.ingredientId) uniqueIngredientIds.add(ing.ingredientId);
            });
        } else if (productDef?.trackStock) {
            uniqueIngredientIds.add(realId);
        }

        if (Array.isArray(item.selectedModifiers)) {
            item.selectedModifiers.forEach(mod => {
                if (mod.ingredientId) uniqueIngredientIds.add(mod.ingredientId);
            });
        }
    });

    // 🔥 CARGA DE STOCK FRESCO (Evita race conditions)
    const freshStockMap = new Map();
    if (uniqueIngredientIds.size > 0) {
        await Promise.all(Array.from(uniqueIngredientIds).map(async (id) => {
            const freshProd = await loadData(STORES.MENU, id);
            if (freshProd) {
                freshStockMap.set(id, freshProd);
            }
        }));
    }

    const missingIngredients = [];
    const simulatedStock = new Map();

    freshStockMap.forEach((product, id) => {
        simulatedStock.set(id, product.stock);
    });

    for (const item of itemsToProcess) {
        const realId = item.parentId || item.id;
        const productDef = productMap.get(realId);

        const itemRequirements = new Map();
        const addRequirement = (id, qty) => {
            if (!id) return;
            itemRequirements.set(id, (itemRequirements.get(id) || 0) + qty);
        };

        // A) Receta Base
        if (productDef?.recipe?.length > 0) {
            productDef.recipe.forEach(ing => {
                addRequirement(ing.ingredientId, ing.quantity * item.quantity);
            });
        }

        // B) Modificadores
        if (Array.isArray(item.selectedModifiers)) {
            item.selectedModifiers.forEach(mod => {
                if (mod.ingredientId) {
                    const modQty = (mod.quantity || 1) * item.quantity;
                    addRequirement(mod.ingredientId, modQty);
                }
            });
        }

        // C) Producto Directo
        if (productDef?.trackStock && (!productDef.recipe || productDef.recipe.length === 0)) {
            addRequirement(realId, item.quantity);
        }

        // --- 🔴 FASE DE VERIFICACIÓN (CON DETECCIÓN DE FANTASMAS) ---
        for (const [reqId, reqQty] of itemRequirements.entries()) {

            // ✨ NUEVO: Detectar ingrediente eliminado (CRÍTICO)
            const realIngData = freshStockMap.get(reqId);

            if (!realIngData) {
                // El ingrediente fue eliminado pero sigue en la receta
                missingIngredients.push({
                    productName: productDef?.name || 'Producto Desconocido',
                    ingredientName: `⚠️ ERROR CRÍTICO: Ingrediente ID ${reqId} no existe (Fue eliminado)`,
                    needed: reqQty,
                    available: 0,
                    unit: '❌'
                });
                continue; // Saltamos este ingrediente y seguimos validando los demás
            }

            // Verificar si existe en el simulador
            if (!simulatedStock.has(reqId)) continue;

            const currentAvailable = simulatedStock.get(reqId);

            if (currentAvailable < reqQty) {
                // Evitar duplicados en el reporte
                const alreadyListed = missingIngredients.some(m => m.ingredientName === realIngData.name);

                if (!alreadyListed) {
                    missingIngredients.push({
                        productName: 'Pedido (Acumulado)',
                        ingredientName: realIngData.name,
                        needed: reqQty,
                        available: realIngData.stock,
                        unit: realIngData.bulkData?.purchase?.unit || 'u'
                    });
                }
            } else {
                simulatedStock.set(reqId, currentAvailable - reqQty);
            }
        }
    }

    if (missingIngredients.length > 0) {
        const details = missingIngredients.map(m =>
            `• ${m.ingredientName}: Tienes ${m.available.toFixed(2)} ${m.unit} (Necesitas ${m.needed.toFixed(2)})`
        ).join('\n');

        return {
            ok: false,
            response: {
                success: false,
                errorType: 'STOCK_WARNING',
                message: `⚠️ STOCK INSUFICIENTE:\n\n${details}\n\nLos ingredientes superan lo disponible.`,
                missingData: missingIngredients
            }
        };
    }

    return { ok: true };
};