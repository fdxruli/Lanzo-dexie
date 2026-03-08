import { create } from 'zustand';
import {
  recycleData,
  loadDataPaginated,
  STORES
} from '../services/database';
import Logger from '../services/Logger';
import { categoriesRepository } from '../services/db/general';

export const useProductStore = create((set, get) => ({
  menu: [],
  categories: [],
  isLoading: false,

  // --- MOTOR DE CURSORES ---
  cursorStack: [null],
  currentPageIndex: 0,
  hasMore: true,
  filters: {
    searchTerm: '',
    categoryId: null
  },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      cursorStack: [null], // Purgar historial al filtrar
      currentPageIndex: 0,
      menu: [],
      hasMore: true
    }));
    get().fetchPage('current');
  },

  fetchPage: async (direction = 'current') => {
    const state = get();
    if (state.isLoading) return;

    let targetPageIndex = state.currentPageIndex;

    if (direction === 'next' && state.hasMore) {
      targetPageIndex += 1;
    } else if (direction === 'prev') {
      targetPageIndex = Math.max(0, state.currentPageIndex - 1);
    }

    const targetCursor = state.cursorStack[targetPageIndex];
    set({ isLoading: true });

    try {
      // Llamada pura a la BD usando cursores
      const { data, nextCursor } = await loadDataPaginated(STORES.MENU, {
        limit: 50,
        cursor: targetCursor,
        searchTerm: state.filters.searchTerm,
        categoryId: state.filters.categoryId
      });

      const newCursorStack = [...state.cursorStack];
      if (nextCursor) {
        newCursorStack[targetPageIndex + 1] = nextCursor;
      }

      set({
        menu: data,
        cursorStack: newCursorStack,
        currentPageIndex: targetPageIndex,
        hasMore: !!nextCursor,
        isLoading: false
      });
    } catch (error) {
      Logger.error('Error en fetchPage:', error);
      set({ isLoading: false });
    }
  },

  loadInitialProducts: async () => {
    set({ isLoading: true });
    try {
      const categories = await categoriesRepository.getActiveCategories();
      set({ categories: categories || [], isLoading: false });
      // Delegamos la carga de productos al motor de paginación
      get().fetchPage('current');
    } catch (error) {
      Logger.error('Error loading initial data:', error);
      set({ isLoading: false });
    }
  },

  deleteProduct: async (productId) => {
    if (!window.confirm('¿Estas seguro de mover este producto a la Papelera?')) return;

    set({ isLoading: true });
    try {
      const result = await recycleData(
        STORES.MENU,
        STORES.DELETED_MENU,
        productId,
        'Eliminado desde Catalogo'
      );

      if (result.success) {
        set((state) => ({
          menu: state.menu.filter((product) => product.id !== productId),
          isLoading: false
        }));

        // Caso límite: Retroceder si vaciamos la página actual
        const { menu, currentPageIndex } = get();
        if (menu.length === 0 && currentPageIndex > 0) {
          get().fetchPage('prev');
        }
      } else {
        alert(`Error al eliminar: ${result.message || 'No encontrado'}`);
        set({ isLoading: false });
      }
    } catch (error) {
      Logger.error('Error eliminando producto:', error);
      set({ isLoading: false });
    }
  },

  refreshCategories: async () => {
    const categories = await categoriesRepository.getActiveCategories();
    set({ categories: categories || [] });
  },

  deleteCategory: async (categoryId) => {
    if (!window.confirm("¿Seguro que deseas eliminar esta categoría?")) return;

    set({ isLoading: true });
    try {
      const result = await categoriesRepository.softDeleteCategory(categoryId);

      if (result.success) {
        set((state) => ({
          categories: state.categories.filter((cat) => cat.id !== categoryId),
          isLoading: false
        }));

        // Caso límite: Purgar filtro si la categoría eliminada estaba activa
        if (get().filters.categoryId === categoryId) {
          get().setFilters({ categoryId: null });
        }
      } else {
        alert(result.message);
        set({ isLoading: false });
      }
    } catch (error) {
      Logger.error('Error eliminando categoría:', error);
      set({ isLoading: false });
    }
  },
}));