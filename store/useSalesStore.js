// src/store/useSalesStore.js
import { create } from 'zustand';
import {
  loadData,
  loadDataPaginated,
  STORES
} from '../services/database';
import Logger from '../services/Logger';
import { cancelSale } from '../services/salesService';

export const useSalesStore = create((set, get) => ({
  sales: [],
  wasteLogs: [],
  isLoading: false,

  loadRecentSales: async () => {
    set({ isLoading: true });
    try {
      const [recentSales, wasteData] = await Promise.all([
        loadDataPaginated(STORES.SALES, { limit: 50, direction: 'prev', timeIndex: 'timestamp' }),
        loadData(STORES.WASTE)
      ]);

      const sortedWaste = (wasteData || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      set({ sales: recentSales, wasteLogs: sortedWaste, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
    }
  },

  deleteSale: async (timestamp, { restoreStock = false } = {}) => {
    const normalizedRestoreStock = Boolean(restoreStock);
    set({ isLoading: true });

    try {
      const currentSales = get().sales;
      const result = await cancelSale({
        timestamp,
        restoreStock: normalizedRestoreStock,
        currentSales
      });

      if (result.success) {
        const updatedSales = currentSales.filter((sale) => sale.timestamp !== timestamp);
        set({ sales: updatedSales });
      }

      return result;
    } catch (error) {
      Logger.error('Error inesperado al cancelar venta:', error);
      return {
        success: false,
        code: 'ERROR',
        restoreStock: normalizedRestoreStock,
        warnings: [],
        message: error?.message || 'Error inesperado al cancelar la venta.'
      };
    } finally {
      set({ isLoading: false });
    }
  }
}));
