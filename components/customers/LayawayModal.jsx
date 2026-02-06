import React, { useState, useEffect } from 'react';
import {
    Package,
    Calendar,
    DollarSign,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Clock,
    ArrowRight,
    ShoppingBag
} from 'lucide-react';
import { layawayRepository } from '../../services/db/layaways';
import { useCaja } from '../../hooks/useCaja';
import { showMessageModal } from '../../services/utils';
import Logger from '../../services/Logger';
import './LayawayModal.css';

export default function LayawayModal({ show, onClose, customer, onUpdate }) {
    const [layaways, setLayaways] = useState([]);
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState(null);

    // Estado para abonos parciales
    const [paymentAmount, setPaymentAmount] = useState('');
    const [selectedLayawayId, setSelectedLayawayId] = useState(null);

    const { registrarMovimiento, cajaActual } = useCaja();

    useEffect(() => {
        if (show && customer) {
            loadLayaways();
        } else {
            setLayaways([]);
            setPaymentAmount('');
            setSelectedLayawayId(null);
        }
    }, [show, customer]);

    const loadLayaways = async () => {
        setLoading(true);
        try {
            const active = await layawayRepository.getByCustomer(customer.id, true);
            // Ordenar: Más recientes primero
            active.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setLayaways(active);
        } catch (error) {
            Logger.error("Error cargando apartados", error);
            showMessageModal("Error al cargar los apartados del cliente.");
        } finally {
            setLoading(false);
        }
    };

    const handleAddPayment = async (layaway) => {
        if (!cajaActual || cajaActual.estado !== 'abierta') {
            showMessageModal('⚠️ Necesitas una caja abierta para recibir dinero.');
            return;
        }

        const amount = parseFloat(paymentAmount);
        const deudaPendiente = layaway.totalAmount - layaway.paidAmount;

        if (!amount || amount <= 0) return showMessageModal('Ingresa un monto válido.');
        if (amount > deudaPendiente + 0.01) return showMessageModal('El monto excede la deuda pendiente.');

        setProcessingId(layaway.id);
        try {
            const movExito = await registrarMovimiento(
                'entrada',
                amount,
                `Abono Apartado #${layaway.id.slice(-4)} - ${customer.name}`
            );

            if (!movExito) throw new Error("No se pudo registrar en caja.");

            await layawayRepository.addPayment(layaway.id, amount);

            showMessageModal('✅ Abono registrado correctamente.');
            setPaymentAmount('');
            setSelectedLayawayId(null);
            loadLayaways();
            if (onUpdate) onUpdate();

        } catch (error) {
            Logger.error("Error en abono apartado", error);
            showMessageModal(`Error: ${error.message}`);
        } finally {
            setProcessingId(null);
        }
    };

    const handleDeliver = async (layaway) => {
        const pending = layaway.totalAmount - layaway.paidAmount;
        if (pending > 0.50) {
            showMessageModal(`⚠️ El apartado tiene saldo pendiente de $${pending.toFixed(2)}. Liquídalo primero.`);
            return;
        }

        if (!window.confirm("¿Confirmar entrega de mercancía? Esto cerrará el apartado y registrará la venta histórica.")) return;

        setProcessingId(layaway.id);
        try {
            await layawayRepository.convertToSale(layaway.id);
            showMessageModal('🎉 ¡Mercancía entregada! Apartado finalizado exitosamente.');
            loadLayaways();
            if (onUpdate) onUpdate();
        } catch (error) {
            Logger.error("Error entregando apartado", error);
            showMessageModal(`Error al entregar: ${error.message}`);
        } finally {
            setProcessingId(null);
        }
    };

    const handleCancel = async (layaway) => {
        if (!window.confirm("¿Seguro que deseas CANCELAR este apartado? El stock será devuelto al inventario.")) return;

        setProcessingId(layaway.id);
        try {
            await layawayRepository.cancel(layaway.id, "Cancelado por el usuario desde Panel Clientes");
            let msg = 'Apartado cancelado. Stock restaurado.';
            if (layaway.paidAmount > 0) {
                msg += ` ℹ️ Devolver $${layaway.paidAmount.toFixed(2)} al cliente (procesar manualmente en caja).`;
            }
            showMessageModal(msg);
            loadLayaways();
            if (onUpdate) onUpdate();
        } catch (error) {
            Logger.error("Error cancelando apartado", error);
            showMessageModal(`Error: ${error.message}`);
        } finally {
            setProcessingId(null);
        }
    };

    // Calcular días transcurridos
    const getDaysElapsed = (dateString) => {
        const start = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - start);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    };

    if (!show || !customer) return null;

    return (
        <div className="modal" style={{ display: 'flex', zIndex: 9999 }}>
            <div className="modal-content layaway-modal-content">
                
                {/* Header Fijo */}
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Package className="text-primary" size={24} />
                        <div>
                            <span>Apartados Activos</span>
                            <small style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-light)', fontWeight: 'normal' }}>
                                Cliente: {customer.name}
                            </small>
                        </div>
                    </h2>
                    <button className="close-btn" onClick={onClose} style={{ fontSize: '1.5rem', color: 'var(--text-light)', background: 'none', border: 'none' }}>
                        &times;
                    </button>
                </div>

                {/* Cuerpo Scrolleable */}
                <div className="layaway-modal-body">
                    {loading ? (
                        <div className="layaway-empty-state">
                            <div className="spinner"></div>
                            <p>Cargando información...</p>
                        </div>
                    ) : layaways.length === 0 ? (
                        <div className="layaway-empty-state">
                            <Package size={64} strokeWidth={1} />
                            <h3>No hay apartados activos</h3>
                            <p>Este cliente no tiene mercancía apartada en este momento.</p>
                        </div>
                    ) : (
                        <div className="layaways-list">
                            {layaways.map(layaway => {
                                const pending = layaway.totalAmount - (layaway.paidAmount || 0);
                                const progress = (layaway.paidAmount / layaway.totalAmount) * 100;
                                const isReady = pending <= 0.01;
                                const daysElapsed = getDaysElapsed(layaway.createdAt);

                                return (
                                    <div key={layaway.id} className="layaway-card">
                                        
                                        {/* HEADER DE LA TARJETA */}
                                        <div className="layaway-card-header">
                                            <div className="layaway-meta">
                                                <div className="layaway-date">
                                                    <Calendar size={16} />
                                                    {new Date(layaway.createdAt).toLocaleDateString()}
                                                    <span style={{ fontSize: '0.8em', color: 'var(--text-light)', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '10px' }}>
                                                        <Clock size={12} /> Hace {daysElapsed} días
                                                    </span>
                                                </div>
                                                <div className="layaway-id">REF: {layaway.id}</div>
                                            </div>
                                            
                                            <div className={`layaway-status-badge ${isReady ? 'ready' : 'pending'}`}>
                                                {isReady ? 'Listo para Entregar' : 'En Proceso'}
                                            </div>
                                        </div>

                                        {/* CUERPO: LISTA DE PRODUCTOS */}
                                        <div className="layaway-card-body">
                                            <table className="layaway-items-table">
                                                <thead>
                                                    <tr>
                                                        <th style={{width: '60%'}}>Producto</th>
                                                        <th style={{textAlign: 'center'}}>Cant.</th>
                                                        <th style={{textAlign: 'right'}}>Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {layaway.items.map((item, idx) => (
                                                        <tr key={idx}>
                                                            <td>
                                                                <div className="item-name">{item.name}</div>
                                                                {(item.variantName || item.skuDetected) && (
                                                                    <span className="item-variant">
                                                                        {item.variantName ? item.variantName : `SKU: ${item.skuDetected}`}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td style={{textAlign: 'center'}}>x{item.quantity}</td>
                                                            <td style={{textAlign: 'right'}}>${(item.price * item.quantity).toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>

                                            {/* RESUMEN FINANCIERO */}
                                            <div className="layaway-financial-section">
                                                <div className="financial-summary">
                                                    <div className="finance-block">
                                                        <span className="finance-label">Total Apartado</span>
                                                        <div className="finance-value total">${layaway.totalAmount.toFixed(2)}</div>
                                                    </div>
                                                    
                                                    {/* Espaciador flexible */}
                                                    <div style={{flex: 1}}></div>

                                                    <div className="finance-block" style={{marginRight: '20px'}}>
                                                        <span className="finance-label">Abonado</span>
                                                        <div className="finance-value paid">${layaway.paidAmount.toFixed(2)}</div>
                                                    </div>
                                                    <div className="finance-block">
                                                        <span className="finance-label">Restante</span>
                                                        <div className="finance-value debt">${pending.toFixed(2)}</div>
                                                    </div>
                                                </div>
                                                
                                                <div className="progress-container">
                                                    <div 
                                                        className={`progress-fill ${isReady ? 'ready' : 'pending'}`}
                                                        style={{ width: `${progress}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* FOOTER: ACCIONES */}
                                        <div className="layaway-card-footer">
                                            
                                            {/* ZONA DE ABONOS */}
                                            {!isReady ? (
                                                <div className="payment-input-group">
                                                    {selectedLayawayId === layaway.id ? (
                                                        <>
                                                            <div className="input-with-icon">
                                                                <span className="input-currency-symbol">$</span>
                                                                <input
                                                                    type="number"
                                                                    className="payment-input-modern"
                                                                    placeholder="0.00"
                                                                    value={paymentAmount}
                                                                    onChange={(e) => setPaymentAmount(e.target.value)}
                                                                    autoFocus
                                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddPayment(layaway)}
                                                                />
                                                            </div>
                                                            <button
                                                                className="btn btn-primary btn-sm btn-icon-text"
                                                                onClick={() => handleAddPayment(layaway)}
                                                                disabled={processingId === layaway.id}
                                                            >
                                                                <CheckCircle size={16} /> Confirmar
                                                            </button>
                                                            <button
                                                                className="btn btn-cancel btn-sm"
                                                                onClick={() => {
                                                                    setSelectedLayawayId(null);
                                                                    setPaymentAmount('');
                                                                }}
                                                            >
                                                                <XCircle size={16} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            className="btn btn-secondary btn-sm btn-icon-text"
                                                            onClick={() => setSelectedLayawayId(layaway.id)}
                                                        >
                                                            <DollarSign size={16} /> Registrar Abono
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ flex: 1, color: 'var(--success-color)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <CheckCircle size={20} />
                                                    ¡Pagado Completo!
                                                </div>
                                            )}

                                            {/* BOTONES DE GESTIÓN */}
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                {isReady && (
                                                    <button
                                                        className="btn btn-success btn-sm btn-icon-text"
                                                        onClick={() => handleDeliver(layaway)}
                                                        disabled={processingId === layaway.id}
                                                    >
                                                        <ShoppingBag size={16} />
                                                        Entregar Mercancía
                                                    </button>
                                                )}

                                                <button
                                                    className="btn btn-delete btn-sm btn-icon-text"
                                                    onClick={() => handleCancel(layaway)}
                                                    disabled={processingId === layaway.id}
                                                    title="Cancelar y devolver al inventario"
                                                >
                                                    <AlertTriangle size={16} /> Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}