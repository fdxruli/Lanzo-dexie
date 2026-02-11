export const runPostSaleEffects = async ({
    sale,
    processedItems,
    paymentData,
    total,
    companyName,
    features,
    loadData,
    saveData,
    STORES,
    useStatsStore,
    roundCurrency,
    sendReceiptWhatsApp
}) => {
    const costOfGoodsSold = processedItems.reduce(
        (acc, item) => roundCurrency(acc + roundCurrency(item.cost * item.quantity)),
        0
    );

    await useStatsStore.getState().updateStatsForNewSale(sale, costOfGoodsSold);

    if (sale.paymentMethod === 'fiado' && sale.customerId && sale.saldoPendiente > 0) {
        const customer = await loadData(STORES.CUSTOMERS, sale.customerId);
        if (customer) {
            customer.debt = (customer.debt || 0) + sale.saldoPendiente;
            await saveData(STORES.CUSTOMERS, customer);
        }
    }

    if (paymentData.sendReceipt && paymentData.customerId) {
        await sendReceiptWhatsApp({
            sale,
            items: processedItems,
            paymentData,
            total,
            companyName,
            features
        });
    }
};
