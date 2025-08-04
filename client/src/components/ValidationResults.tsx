import React from 'react';
import { ValidationResult, BriefingData } from '../types';
import './ValidationResults.css';

interface ValidationResultsProps {
  validation: ValidationResult;
  briefingData: BriefingData;
}

const ValidationResults: React.FC<ValidationResultsProps> = ({ validation, briefingData }) => {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="validation-results">
      <div className="validation-header">
        <h2>Validierungsergebnisse</h2>
        <div className={`validation-status ${validation.isValid ? 'valid' : 'invalid'}`}>
          {validation.isValid ? '✅ Gültig' : '❌ Ungültig'}
        </div>
      </div>

      <div className="file-info-card">
        <h3>Datei-Informationen</h3>
        <div className="info-grid">
          <div className="info-item">
            <label>Dateiname:</label>
            <span>{briefingData.filename}</span>
          </div>
          <div className="info-item">
            <label>Dateigröße:</label>
            <span>{formatFileSize(briefingData.fileSize)}</span>
          </div>
          <div className="info-item">
            <label>Slug:</label>
            <span>{briefingData.slug || 'Nicht gefunden'}</span>
          </div>
        </div>
      </div>

      <div className="meta-info-card">
        <h3>Meta-Informationen</h3>
        <div className="meta-grid">
          <div className="meta-item">
            <label>Meta Title:</label>
            <span>{briefingData.metaInfo.metaTitle || 'Nicht gefunden'}</span>
          </div>
          <div className="meta-item">
            <label>Meta Description:</label>
            <span>{briefingData.metaInfo.metaDescription || 'Nicht gefunden'}</span>
          </div>
        </div>
      </div>

      {validation.errors.length > 0 && (
        <div className="validation-errors">
          <h3>Gefundene Probleme</h3>
          <ul>
            {validation.errors.map((error, index) => (
              <li key={index} className="error-item">
                ❌ {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {validation.isValid && (
        <div className="validation-success">
          <h3>✅ Alle Validierungen erfolgreich</h3>
          <p>Die Datei hat das korrekte Format und kann in Contentful importiert werden.</p>
        </div>
      )}

      {validation.missingFields.length > 0 && (
        <div className="missing-fields">
          <h3>Fehlende Felder</h3>
          <ul>
            {validation.missingFields.map((field, index) => (
              <li key={index} className="missing-item">
                ⚠️ {field}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ValidationResults; 