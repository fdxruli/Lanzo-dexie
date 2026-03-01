const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createWarning = (code, message, context = undefined) => (
  context ? { code, message, context } : { code, message }
);

const makeResult = ({
  success,
  code,
  restoreStock,
  warnings,
  message
}) => ({
  success,
  code,
  restoreStock,
  warnings,
  ...(message ? { message } : {})
});

const restoreInventoryBestEffort = async ({ sale, deps, warnings }) => {
  const { loadData, saveDataSafe, STORES, db, Logger } = deps;
  const affectedParentIds = new Set();

  for (const item of sale.items || []) {
    const hasBatches = Array.isArray(item?.batchesUsed) && item.batchesUsed.length > 0;

    if (hasBatches) {
      for (const batchUsage of item.batchesUsed) {
        try {
          const batch = await loadData(STORES.PRODUCT_BATCHES, batchUsage.batchId);

          if (!batch) {
            warnings.push(createWarning(
              'BATCH_NOT_FOUND',
              `No se encontro el lote ${batchUsage.batchId} para restauracion.`,
              { batchId: batchUsage.batchId, itemId: item.id }
            ));
            continue;
          }

          const restoredQuantity = toFiniteNumber(batchUsage.quantity);
          const updatedBatch = {
            ...batch,
            stock: toFiniteNumber(batch.stock) + restoredQuantity,
            isActive: (toFiniteNumber(batch.stock) + restoredQuantity) > 0,
            updatedAt: new Date().toISOString()
          };

          const saveBatchResult = await saveDataSafe(STORES.PRODUCT_BATCHES, updatedBatch);
          if (!saveBatchResult?.success) {
            warnings.push(createWarning(
              'BATCH_SAVE_FAILED',
              `No se pudo guardar el lote ${batchUsage.batchId} durante la restauracion.`,
              { batchId: batchUsage.batchId, message: saveBatchResult?.message }
            ));
            continue;
          }

          const parentIdToSync = batchUsage.ingredientId || batch.productId;
          if (parentIdToSync) {
            affectedParentIds.add(parentIdToSync);
          }
        } catch (error) {
          Logger.error(`Error restaurando lote ${batchUsage.batchId}:`, error);
          warnings.push(createWarning(
            'BATCH_RESTORE_ERROR',
            `Error inesperado al restaurar el lote ${batchUsage.batchId}.`,
            { batchId: batchUsage.batchId, error: error.message }
          ));
        }
      }

      continue;
    }

    try {
      const productId = item.parentId || item.id;
      const parentProduct = await loadData(STORES.MENU, productId);

      if (!parentProduct) {
        warnings.push(createWarning(
          'PRODUCT_NOT_FOUND',
          `No se encontro el producto ${productId} para restaurar stock.`,
          { productId, itemId: item.id }
        ));
        continue;
      }

      if (parentProduct.trackStock === false) {
        continue;
      }

      const quantityToRestore = toFiniteNumber(item.stockDeducted ?? item.quantity);
      const updatedProduct = {
        ...parentProduct,
        stock: toFiniteNumber(parentProduct.stock) + quantityToRestore,
        updatedAt: new Date().toISOString()
      };

      const saveProductResult = await saveDataSafe(STORES.MENU, updatedProduct);
      if (!saveProductResult?.success) {
        warnings.push(createWarning(
          'PRODUCT_SAVE_FAILED',
          `No se pudo restaurar stock del producto ${productId}.`,
          { productId, message: saveProductResult?.message }
        ));
      }
    } catch (error) {
      Logger.error(`Error restaurando producto simple ${item.id}:`, error);
      warnings.push(createWarning(
        'PRODUCT_RESTORE_ERROR',
        `Error inesperado al restaurar stock del producto ${item.id}.`,
        { itemId: item.id, error: error.message }
      ));
    }
  }

  if (affectedParentIds.size === 0) {
    return;
  }

  for (const productId of affectedParentIds) {
    try {
      const parentProduct = await loadData(STORES.MENU, productId);
      if (!parentProduct) {
        warnings.push(createWarning(
          'PARENT_PRODUCT_NOT_FOUND',
          `No se encontro el producto padre ${productId} para sincronizar stock.`,
          { productId }
        ));
        continue;
      }

      const allBatches = await db.table(STORES.PRODUCT_BATCHES)
        .where('productId')
        .equals(productId)
        .toArray();

      const totalStock = (allBatches || [])
        .filter((batch) => batch?.isActive && toFiniteNumber(batch?.stock) > 0)
        .reduce((sum, batch) => sum + toFiniteNumber(batch?.stock), 0);

      const saveSyncResult = await saveDataSafe(STORES.MENU, {
        ...parentProduct,
        stock: totalStock,
        updatedAt: new Date().toISOString()
      });

      if (!saveSyncResult?.success) {
        warnings.push(createWarning(
          'PARENT_SYNC_FAILED',
          `No se pudo sincronizar el stock del producto ${productId}.`,
          { productId, message: saveSyncResult?.message }
        ));
      }
    } catch (error) {
      Logger.error(`Error sincronizando producto padre ${productId}:`, error);
      warnings.push(createWarning(
        'PARENT_SYNC_ERROR',
        `Error inesperado al sincronizar el producto ${productId}.`,
        { productId, error: error.message }
      ));
    }
  }
};

export const cancelSaleCore = async (
  {
    saleTimestamp,
    restoreStock = false,
    currentSales = []
  },
  deps
) => {
  const normalizedRestoreStock = Boolean(restoreStock);
  const warnings = [];
  const {
    loadData,
    recycleData,
    STORES,
    Logger
  } = deps;

  try {
    let saleFound = Array.isArray(currentSales)
      ? currentSales.find((sale) => sale?.timestamp === saleTimestamp)
      : null;

    if (!saleFound) {
      const persistedSales = await loadData(STORES.SALES);
      saleFound = (persistedSales || []).find((sale) => sale?.timestamp === saleTimestamp);
    }

    if (!saleFound) {
      return makeResult({
        success: false,
        code: 'NOT_FOUND',
        restoreStock: normalizedRestoreStock,
        warnings,
        message: 'No se encontro la venta solicitada.'
      });
    }

    if (normalizedRestoreStock) {
      await restoreInventoryBestEffort({ sale: saleFound, deps, warnings });
    }

    const saleKey = saleFound.id || saleFound.timestamp;
    const auditReason = normalizedRestoreStock
      ? 'Eliminado manualmente - Inventario Devuelto'
      : 'Eliminado manualmente - Inventario NO Devuelto (Merma)';

    const recycleResult = await recycleData(
      STORES.SALES,
      STORES.DELETED_SALES,
      saleKey,
      auditReason
    );

    if (!recycleResult?.success) {
      return makeResult({
        success: false,
        code: 'RECYCLE_FAILED',
        restoreStock: normalizedRestoreStock,
        warnings,
        message: recycleResult?.message || 'No se pudo mover la venta a la papelera.'
      });
    }

    return makeResult({
      success: true,
      code: 'DELETED',
      restoreStock: normalizedRestoreStock,
      warnings,
      message: warnings.length > 0
        ? 'La venta se cancelo con advertencias durante la restauracion de inventario.'
        : undefined
    });
  } catch (error) {
    Logger.error('Error inesperado al cancelar venta:', error);
    return makeResult({
      success: false,
      code: 'ERROR',
      restoreStock: normalizedRestoreStock,
      warnings,
      message: error?.message || 'Error inesperado al cancelar la venta.'
    });
  }
};

