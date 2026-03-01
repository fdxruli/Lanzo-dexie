import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInventoryMovement } from '../../../../hooks/useInventoryMovement';
import { useProductStore } from '../../../../store/useProductStore';
import { saveBatchAndSyncProductSafe, saveDataSafe, STORES } from '../../../../services/database';
import { executeBatchWithPaymentSafe } from '../../../../services/database';
import { showMessageModal } from '../../../../services/utils';
import { loadBatchesForManager } from '../../../../services/inventoryMovement';
import { useStatsStore } from '../../../../store/useStatsStore';
import Logger from '../../../../services/Logger';

/**
 * @param {Object} params
 * @param {Array<Object>} params.rawProducts
 * @param {Object | undefined} params.selectedProduct
 * @param {string | null} params.selectedProductId
 * @param {(productId: string | null) => void} params.onProductSelect
 * @param {(term: string) => void} params.searchProducts
 * @param {() => Promise<void> | void} params.loadInitialProducts
 * @param {() => Promise<void> | void} params.refreshData
 */
export function useBatchManagerController({
  rawProducts,
  selectedProduct,
  selectedProductId,
  onProductSelect,
  searchProducts,
  loadInitialProducts,
  refreshData
}) {
  const { loadBatchesForProduct } = useInventoryMovement();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [batchToEdit, setBatchToEdit] = useState(null);
  const [localBatches, setLocalBatches] = useState([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const adjustInventoryValue = useStatsStore((state) => state.adjustInventoryValue);
  const [inventoryValue, setInventoryValue] = useState(0);

  useEffect(() => {
    const selectedProd = rawProducts.find((p) => p.id === selectedProductId);
    if (selectedProd && searchTerm === selectedProd.name) return undefined;

    const timer = setTimeout(() => {
      if (searchTerm.trim().length >= 1) {
        searchProducts(searchTerm);
        return;
      }

      if (searchTerm === '' && !selectedProductId) {
        loadInitialProducts();
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    loadInitialProducts,
    rawProducts,
    searchProducts,
    searchTerm,
    selectedProductId
  ]);

  useEffect(() => {
    const selectedProd = rawProducts.find((p) => p.id === selectedProductId);

    // Si el término es exactamente el nombre seleccionado, abortamos la búsqueda
    if (selectedProd && searchTerm === selectedProd.name) {
      setFilteredProducts([]);
      return undefined;
    }

    // Si el input está vacío, limpiamos sugerencias y recargamos la lista inicial
    if (searchTerm.trim().length === 0) {
      setFilteredProducts([]);
      const timerEmpty = setTimeout(() => {
        if (!selectedProductId) loadInitialProducts();
      }, 300);
      return () => clearTimeout(timerEmpty);
    }

    // Debounce estricto: Delegamos la búsqueda real al Store
    const timerSearch = setTimeout(() => {
      // Disparamos la búsqueda global (que busca en IndexedDB/Supabase)
      // La lista real actualizada provendrá de 'rawProducts' o 'searchProducts' en tu store
      searchProducts(searchTerm);

      // Enlazamos directamente filteredProducts a rawProducts ya que el store actualizará
      // rawProducts con el resultado de la búsqueda.
      setShowSuggestions(true);
    }, 300);

    return () => clearTimeout(timerSearch);
  }, [
    searchTerm,
    selectedProductId,
    loadInitialProducts,
    searchProducts,
    rawProducts
  ]);

  // Sincronizar sugerencias cuando rawProducts se actualiza por una búsqueda
  useEffect(() => {
    if (searchTerm.trim().length > 0 && showSuggestions) {
      setFilteredProducts(rawProducts.slice(0, 10)); // Mostrar un máximo de 10 sugerencias visuales
    }
  }, [rawProducts, searchTerm, showSuggestions]);

  const fetchBatches = useCallback(async () => {
    if (!selectedProductId) {
        setLocalBatches([]);
        setInventoryValue(0);
        return;
    }

    setIsLoadingBatches(true);
    try {
        // Obtenemos los datos pre-procesados y limitados desde Dexie
        const data = await loadBatchesForManager(selectedProductId);
        setLocalBatches(data.batches);
        setInventoryValue(data.inventoryValue);
    } catch (error) {
        Logger.error('Error cargando lotes:', error);
        setLocalBatches([]);
        setInventoryValue(0);
    } finally {
        setIsLoadingBatches(false);
    }
}, [selectedProductId]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && selectedProductId) {
        fetchBatches();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchBatches, selectedProductId]);

  const productBatches = localBatches;

  const totalStock = selectedProduct?.stock || 0;

  const handleSelectProduct = useCallback((product) => {
    setSearchTerm(product.name);
    onProductSelect(product.id);
    setShowSuggestions(false);
  }, [onProductSelect]);

  const openNewBatchModal = useCallback(() => {
    setBatchToEdit(null);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleEditBatch = useCallback((batch) => {
    setBatchToEdit(batch);
    setIsModalOpen(true);
  }, []);

  const handleSaveBatch = useCallback(async (batchData, paymentInfo = null) => {
    if (!selectedProduct || !selectedProductId) return false;

    try {
      if (!selectedProduct.trackStock || !selectedProduct.batchManagement?.enabled) {
        const updatedProduct = {
          ...selectedProduct,
          trackStock: true,
          batchManagement: {
            ...(selectedProduct.batchManagement || {}),
            enabled: true,
            selectionStrategy: selectedProduct.batchManagement?.selectionStrategy || 'fifo'
          }
        };

        const updateProductResult = await saveDataSafe(STORES.MENU, updatedProduct);
        if (!updateProductResult?.success) {
          throw updateProductResult?.error || new Error(updateProductResult?.message || 'No se pudo actualizar el producto.');
        }

        await useProductStore.getState().loadInitialProducts();
      }

      let saveBatchResult;

      const isNewProduction = !isEditing && Array.isArray(selectedProduct.recipe) && selectedProduct.recipe.length > 0;

      if (paymentInfo) {
        saveBatchResult = await executeBatchWithPaymentSafe(batchData, paymentInfo);
      } else if (isNewProduction) {
        saveBatchResult = await executeProductionBatchSafe(batchData, selectedProduct.recipe);
      } else {
        saveBatchResult = await saveBatchAndSyncProductSafe(batchData);
      }

      if (!saveBatchResult?.success) {
        throw saveBatchResult?.error || new Error(saveBatchResult?.message || 'No se pudo guardar el lote.');
      }

      await fetchBatches();
      await refreshData();
      showMessageModal(isNewProduction ? 'Lote producido e ingredientes descontados correctamente.' : 'Lote guardado y stock actualizado.');
      return { success: true, rawMaterialsCost: saveBatchResult.rawMaterialsCost || 0 };
    } catch (error) {
      Logger.error(error);
      showMessageModal(`Error: ${error.message}`);
      return false;
    }
  }, [fetchBatches, refreshData, selectedProduct, selectedProductId]);

  const handleDeleteBatch = useCallback(async (batch) => {
    const stockNumber = Number(batch.stock);
    const hasStock = stockNumber > 0;
    const hasNegativeStock = stockNumber < 0;

    let confirmMessage = '¿Archivar este lote? (Se mantendrá en el historial para reportes)';
    let actionType = 'Normal';

    // Manejo de casos límite: Merma vs Descuadre
    if (hasStock) {
      confirmMessage = `ATENCIÓN: Este lote aún tiene ${stockNumber} unidades. Si lo archivas, se registrará como MERMA (pérdida). El stock pasará a 0 y perderás el valor invertido. ¿Proceder?`;
      actionType = 'Merma';
    } else if (hasNegativeStock) {
      confirmMessage = `ATENCIÓN: Este lote tiene un descuadre de ${stockNumber} unidades (Stock Negativo). Al archivarlo, se ajustará a 0 para corregir el error contable sin afectar el historial de compras. ¿Proceder?`;
      actionType = 'Corrección de Descuadre';
    }

    const confirmArchive = window.confirm(confirmMessage);
    if (!confirmArchive) return;

    try {
      const archivedBatch = {
        ...batch,
        stock: 0, // Forzamos a cero para limpiar el inventario real
        isActive: false,
        isArchived: true,
        deletedAt: new Date().toISOString(),
        // Dejamos un rastro inmutable en las notas para la auditoría
        notes: (hasStock || hasNegativeStock)
          ? `[${actionType.toUpperCase()} - ${new Date().toLocaleDateString()}] Stock original antes de archivar: ${stockNumber}. ${batch.notes || ''}` 
          : batch.notes
      };

      const archiveResult = await saveBatchAndSyncProductSafe(archivedBatch);
      if (!archiveResult?.success) {
        throw archiveResult?.error || new Error(archiveResult?.message || 'No se pudo archivar el lote.');
      }

      // Corrección Contable Unificada:
      // Fórmula: Diferencia = Valor Nuevo (0) - Valor Viejo (stock * costo)
      // Si el stock era 5 y costaba 10: -(5 * 10) = -50 (Resta 50 de merma)
      // Si el stock era -5 y costaba 10: -(-5 * 10) = +50 (Suma 50 para neutralizar el déficit)
      if (stockNumber !== 0) {
        const valueDifference = -(stockNumber * Number(batch.cost || 0));
        if (valueDifference !== 0) {
          await adjustInventoryValue(valueDifference);
        }
      }

      await fetchBatches();
      await refreshData();
      
      showMessageModal(
        actionType === 'Normal' 
          ? 'Lote archivado correctamente.' 
          : `Lote archivado (${actionType} registrada).`
      );
    } catch (error) {
      Logger.error(error);
      showMessageModal(`Error: ${error.message}`);
    }
  }, [fetchBatches, refreshData, adjustInventoryValue]);

  return {
    isModalOpen,
    batchToEdit,
    searchTerm,
    showSuggestions,
    filteredProducts,
    productBatches,
    totalStock,
    inventoryValue,
    isLoadingBatches,
    setSearchTerm,
    setShowSuggestions,
    setBatchToEdit,
    handleSelectProduct,
    handleSaveBatch,
    handleEditBatch,
    handleDeleteBatch,
    openNewBatchModal,
    closeModal,
    refreshBatches: fetchBatches
  };
}

