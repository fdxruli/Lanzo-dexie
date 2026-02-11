import {
    loadData,
    saveData,
    STORES
} from '../database';
import { roundCurrency } from '../utils';

export const updateDailyStats = async (sale) => {
    const dateKey = new Date(sale.timestamp).toISOString().split('T')[0];

    let dailyStat = await loadData(STORES.DAILY_STATS, dateKey);

    if (!dailyStat) {
        dailyStat = {
            id: dateKey,
            date: dateKey,
            revenue: 0,
            profit: 0,
            orders: 0,
            itemsSold: 0
        };
    }

    let saleProfit = 0;
    sale.items.forEach(item => {
        const cost = item.cost || 0;
        const profitUnitario = roundCurrency(item.price - cost);
        saleProfit += roundCurrency(profitUnitario * item.quantity);
    });

    dailyStat.revenue += sale.total;
    dailyStat.profit += saleProfit;
    dailyStat.orders += 1;
    dailyStat.itemsSold += sale.items.reduce((acc, i) => acc + i.quantity, 0);

    await saveData(STORES.DAILY_STATS, dailyStat);
};

export const getFastDashboardStats = async () => {
    const allDays = await loadData(STORES.DAILY_STATS);

    return allDays.reduce((acc, day) => ({
        totalRevenue: acc.totalRevenue + day.revenue,
        totalNetProfit: acc.totalNetProfit + day.profit,
        totalOrders: acc.totalOrders + day.orders,
        totalItemsSold: acc.totalItemsSold + day.itemsSold
    }), { totalRevenue: 0, totalNetProfit: 0, totalOrders: 0, totalItemsSold: 0 });
};
