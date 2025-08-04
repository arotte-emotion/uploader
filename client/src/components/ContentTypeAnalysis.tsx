import React from 'react';
import { MetaInfo } from '../types';
import './ContentTypeAnalysis.css';

interface ContentTypeAnalysisProps {
  contentTypes: string[];
  slug: string | null;
  metaInfo: MetaInfo;
}

const ContentTypeAnalysis: React.FC<ContentTypeAnalysisProps> = ({ 
  contentTypes, 
  slug, 
  metaInfo 
}) => {
  const getContentTypeIcon = (type: string): string => {
    switch (type) {
      case 'FAQ Accordion':
        return '📋';
      case 'Rich Text':
        return '📝';
      case 'Text Button Link':
        return '🔗';
      case 'Image Placeholder':
        return '🖼️';
      default:
        return '📄';
    }
  };

  const getContentTypeDescription = (type: string): string => {
    switch (type) {
      case 'FAQ Accordion':
        return 'Häufig gestellte Fragen in einem aufklappbaren Format';
      case 'Rich Text':
        return 'Formatierter Text mit verschiedenen Styling-Optionen';
      case 'Text Button Link':
        return 'Klickbare Buttons mit Links zu anderen Seiten';
      case 'Image Placeholder':
        return 'Platzhalter für Bilder und Medien';
      default:
        return 'Unbekannter Content-Type';
    }
  };

  return (
    <div className="content-type-analysis">
      <div className="analysis-header">
        <h2>Contentful Content-Type Analyse</h2>
        <p>Erkannte Content-Types für den Import</p>
      </div>

      <div className="page-info-card">
        <h3>Seiten-Informationen</h3>
        <div className="page-info-grid">
          <div className="page-info-item">
            <label>URL-Slug:</label>
            <span className="slug-value">{slug || 'Nicht definiert'}</span>
          </div>
          <div className="page-info-item">
            <label>Seitentitel:</label>
            <span>{metaInfo.metaTitle || 'Nicht definiert'}</span>
          </div>
          <div className="page-info-item">
            <label>Beschreibung:</label>
            <span>{metaInfo.metaDescription || 'Nicht definiert'}</span>
          </div>
        </div>
      </div>

      <div className="content-types-section">
        <h3>Erkannte Content-Types ({contentTypes.length})</h3>
        
        {contentTypes.length === 0 ? (
          <div className="no-content-types">
            <p>⚠️ Keine spezifischen Content-Types erkannt</p>
            <p>Das System wird eine Standard-Seite erstellen.</p>
          </div>
        ) : (
          <div className="content-types-grid">
            {contentTypes.map((type, index) => (
              <div key={index} className="content-type-card">
                <div className="content-type-icon">
                  {getContentTypeIcon(type)}
                </div>
                <div className="content-type-info">
                  <h4>{type}</h4>
                  <p>{getContentTypeDescription(type)}</p>
                </div>
                <div className="content-type-status">
                  ✅ Wird erstellt
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="import-preview">
        <h3>Import-Vorschau</h3>
        <div className="preview-items">
          <div className="preview-item">
            <span className="preview-icon">📄</span>
            <span>Hauptseite wird erstellt</span>
          </div>
          {contentTypes.includes('Rich Text') && (
            <div className="preview-item">
              <span className="preview-icon">📝</span>
              <span>Rich Text Einträge werden erstellt</span>
            </div>
          )}
          {contentTypes.includes('FAQ Accordion') && (
            <div className="preview-item">
              <span className="preview-icon">📋</span>
              <span>FAQ Accordion wird erstellt</span>
            </div>
          )}
          {contentTypes.includes('Text Button Link') && (
            <div className="preview-item">
              <span className="preview-icon">🔗</span>
              <span>Button Links werden erstellt</span>
            </div>
          )}
          {contentTypes.includes('Image Placeholder') && (
            <div className="preview-item">
              <span className="preview-icon">🖼️</span>
              <span>Bild-Platzhalter werden erstellt</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContentTypeAnalysis; 