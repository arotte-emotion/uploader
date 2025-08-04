import React from 'react';
import { ImportResult } from '../types';
import './ImportStatus.css';

interface ImportStatusProps {
  result: ImportResult;
  onReset: () => void;
}

const ImportStatus: React.FC<ImportStatusProps> = ({ result, onReset }) => {
  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString('de-DE');
  };

  const getStatusIcon = (status: string): string => {
    return status === 'success' ? '✅' : '❌';
  };

  const getStatusClass = (status: string): string => {
    return status === 'success' ? 'success' : 'error';
  };

  return (
    <div className="import-status">
      <div className="status-header">
        <h2>Import-Status</h2>
        <div className={`status-badge ${getStatusClass(result.status)}`}>
          {getStatusIcon(result.status)} {result.status === 'success' ? 'Erfolgreich' : 'Fehlgeschlagen'}
        </div>
      </div>

      <div className="status-message">
        <h3>{result.message}</h3>
        <p className="timestamp">Importiert am: {formatTimestamp(result.timestamp)}</p>
      </div>

      <div className="import-summary">
        <h3>Import-Zusammenfassung</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">Erstellte Einträge:</span>
            <span className="summary-value">{result.entriesCreated}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Hauptseite:</span>
            <span className="summary-value">
              {result.details.pageCreated ? '✅ Erstellt' : '❌ Fehlgeschlagen'}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Rich Text Einträge:</span>
            <span className="summary-value">{result.details.richTextEntries}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">FAQ Einträge:</span>
            <span className="summary-value">{result.details.faqEntries}</span>
          </div>
        </div>
      </div>

      {result.status === 'success' && (
        <div className="success-details">
          <h3>✅ Import erfolgreich abgeschlossen</h3>
          <div className="success-items">
            <div className="success-item">
              <span className="success-icon">📄</span>
              <span>Seite wurde in Contentful erstellt</span>
            </div>
            <div className="success-item">
              <span className="success-icon">📝</span>
              <span>Rich Text Inhalte wurden importiert</span>
            </div>
            <div className="success-item">
              <span className="success-icon">📋</span>
              <span>FAQ Einträge wurden erstellt</span>
            </div>
            <div className="success-item">
              <span className="success-icon">🔗</span>
              <span>Links und Buttons wurden konfiguriert</span>
            </div>
          </div>
        </div>
      )}

      <div className="next-steps">
        <h3>Nächste Schritte</h3>
        <div className="steps-list">
          <div className="step-item">
            <span className="step-number">1</span>
            <span>Überprüfen Sie die erstellte Seite in Contentful</span>
          </div>
          <div className="step-item">
            <span className="step-number">2</span>
            <span>Testen Sie die Seite in der Vorschau</span>
          </div>
          <div className="step-item">
            <span className="step-number">3</span>
            <span>Veröffentlichen Sie die Seite wenn alles korrekt ist</span>
          </div>
        </div>
      </div>

      <div className="action-buttons">
        <button 
          className="btn btn-primary"
          onClick={onReset}
        >
          Neue Datei hochladen
        </button>
        
        <button 
          className="btn btn-secondary"
          onClick={() => window.open('https://app.contentful.com', '_blank')}
        >
          Contentful öffnen
        </button>
      </div>
    </div>
  );
};

export default ImportStatus; 