import {
    loadData,
    saveData,
    STORES,
    queryBatchesByProductIdAndActive,
    queryByIndex,
    executeSaleTransactionSafe
} from './database';
import { useStatsStore } from '../store/useStatsStore';
import { roundCurrency, sendWhatsAppMessage } from './utils';
import { calculateCompositePrice } from './pricingLogic';
import Logger from './Logger';
import { processSaleCore } from './sales/processSaleCore';
import { sendReceiptWhatsApp as sendReceiptWhatsAppBase } from './sales/receiptWhatsApp';

export { updateDailyStats, getFastDashboardStats } from './sales/statsService';

const sendReceiptWhatsApp = (params) => sendReceiptWhatsAppBase({
    ...params,
    loadData,
    STORES,
    sendWhatsAppMessage,
    Logger
});

export const processSale = async (params) => {
    return processSaleCore(params, {
        loadData,
        saveData,
        STORES,
        queryBatchesByProductIdAndActive,
        queryByIndex,
        executeSaleTransactionSafe,
        useStatsStore,
        roundCurrency,
        sendReceiptWhatsApp,
        calculateCompositePrice,
        Logger
    });
};
