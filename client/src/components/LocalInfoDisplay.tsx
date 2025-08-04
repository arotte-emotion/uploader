import React from 'react';
import { LocalInfo } from '../types';
import './LocalInfoDisplay.css';

interface LocalInfoDisplayProps {
  localInfo: LocalInfo[];
}

const LocalInfoDisplay: React.FC<LocalInfoDisplayProps> = ({ localInfo }) => {
  if (localInfo.length === 0) {
    return null;
  }

  return (
    <div className="local-info-display">
      <div className="local-info-header">
        <h3>📍 Contentful Local-Informationen</h3>
        <p>Spezielle Informationen für Contentful Local-Felder</p>
      </div>

      <div className="local-info-list">
        {localInfo.map((info, index) => (
          <div key={index} className="local-info-item">
            <div className="local-info-content">
              <span className="line-number">Zeile {info.lineNumber}:</span>
              <span className="local-content">{info.content}</span>
            </div>
            <div className="local-info-badge">
              <span className="badge">Local</span>
            </div>
          </div>
        ))}
      </div>

      <div className="local-info-help">
        <h4>Hinweis:</h4>
        <p>
          Diese Informationen werden für Contentful Local-Felder verwendet und 
          nicht als Rich Text Content verarbeitet.
        </p>
      </div>
    </div>
  );
};

export default LocalInfoDisplay; 