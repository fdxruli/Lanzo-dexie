import React, { useState, useEffect } from 'react';
import './SettingsPage.css';
import GeneralSettings from '../components/settings/GeneralSettings';
import LicenseSettings from '../components/settings/LicenseSettings';
import MaintenanceSettings from '../components/settings/MaintenanceSettings';
import DbMigrationTester from '../components/debug/DbMigrationTester';
import { useSearchParams } from 'react-router-dom';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [searchParams] = useSearchParams();

  useEffect(() => {
       if (searchParams.get('tab') === 'maintenance') {
           setActiveTab('maintenance');
       }
   }, [searchParams]);

  return (
    <div className="settings-page-wrapper">
      <div className="tabs-container">
        <button
          className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          Datos y Apariencia
        </button>
        <button
          className={`tab-btn ${activeTab === 'license' ? 'active' : ''}`}
          onClick={() => setActiveTab('license')}
        >
          Licencia y Rubros
        </button>
        <button
          className={`tab-btn ${activeTab === 'maintenance' ? 'active' : ''}`}
          onClick={() => setActiveTab('maintenance')}
        >
          Datos y Mantenimiento
        </button>
        {import.meta.env.DEV && (
          <button
          className={`tab-btn ${activeTab === 'debug' ? 'active' : ''}`} // Ajusta 'tab-btn' a tu clase CSS real
          onClick={() => setActiveTab('debug')}
        >
          Depuración DB
        </button>
        )}
      </div>

      <div className="settings-content">
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'license' && <LicenseSettings />}
        {activeTab === 'maintenance' && <MaintenanceSettings />}
        {activeTab === 'debug' && (
          <div className="debug-section">
            <h3>Zona de Peligro & Pruebas</h3>
            <p className="text-warning">
              Herramienta técnica para verificar la migración a Dexie v2.
              Usa esto solo si sabes lo que haces.
            </p>
            <DbMigrationTester />
          </div>
        )}
      </div>
    </div>
  );
}