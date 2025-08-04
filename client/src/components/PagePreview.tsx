import React from 'react';
import { MetaInfo } from '../types';
import './PagePreview.css';

interface PagePreviewProps {
  slug: string | null;
  metaInfo: MetaInfo;
  contentTypes: string[];
  briefingText?: string;
}

const PagePreview: React.FC<PagePreviewProps> = ({ slug, metaInfo, contentTypes, briefingText }) => {
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
      case 'Teaser Element':
        return '📦';
      default:
        return '📄';
    }
  };

  const getContentTypeColor = (type: string): string => {
    switch (type) {
      case 'FAQ Accordion':
        return '#27ae60';
      case 'Rich Text':
        return '#3498db';
      case 'Text Button Link':
        return '#f39c12';
      case 'Image Placeholder':
        return '#9b59b6';
      case 'Teaser Element':
        return '#e74c3c';
      default:
        return '#95a5a6';
    }
  };

  // Eigene Textanalyse für echte Inhalte
  const analyzeTextSections = () => {
    if (!briefingText) return [];

    const sections: Array<{
      type: string;
      content: string;
      startLine: number;
      endLine: number;
    }> = [];

    const lines = briefingText.split('\n');
    let currentSection = '';
    let currentType = '';
    let startLine = 0;
    let isFAQSection = false;
    let currentFAQ = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Meta-Informationen überspringen (Slug, MT:, MD:, local:)
      if (line.startsWith('Slug:') || line.startsWith('MT:') || line.startsWith('MD:') || line.startsWith('local:') || line.startsWith('Meta Title:') || line.startsWith('Meta Description:')) {
        continue;
      }

      // FAQ-Ende Erkennung
      if (line.includes('[FAQ Ende]')) {
        if (currentFAQ) {
          // Letztes FAQ beenden
          currentSection += currentFAQ.question + '\n' + currentFAQ.answer + '\n\n';
        }
        if (currentSection && currentType === 'FAQ Accordion') {
          sections.push({
            type: currentType,
            content: currentSection.trim(),
            startLine: startLine + 1,
            endLine: i
          });
        }
        isFAQSection = false;
        currentFAQ = null;
        currentSection = '';
        currentType = '';
        startLine = i; // Neuer Startpunkt für nachfolgende Inhalte
        continue;
      }

      // FAQ-Start Erkennung
      if (line.includes('[FAQ Start]')) {
        if (currentSection && currentType) {
          sections.push({
            type: currentType,
            content: currentSection.trim(),
            startLine: startLine + 1,
            endLine: i
          });
        }
        isFAQSection = true;
        currentType = 'FAQ Accordion';
        currentSection = line + '\n';
        startLine = i;
        continue;
      }

      // FAQ-Element Erkennung
      if (isFAQSection) {
        if (line.startsWith('H3:')) {
          if (currentFAQ) {
            // Vorheriges FAQ beenden
            currentSection += currentFAQ.question + '\n' + currentFAQ.answer + '\n\n';
          }
          currentFAQ = {
            question: line.replace('H3:', '').trim(),
            answer: ''
          };
        } else if (currentFAQ && line.trim() !== '') {
          currentFAQ.answer += line.trim() + ' ';
        } else {
          currentSection += line + '\n';
        }
        continue;
      }

      // Rich Text Erkennung
      if (line.startsWith('H1:') || 
          line.startsWith('H2:') || 
          line.startsWith('H3:') || 
          line.startsWith('H4:') || 
          line.startsWith('H5:') || 
          line.startsWith('H6:') ||
          line.includes('Inhalt:') || 
          line.includes('Text:') ||
          line.includes('Beschreibung:') ||
          line.includes('Einleitung:') ||
          line.includes('Haupttext:') ||
          line.includes('Content:') ||
          line.includes('Abschnitt:') ||
          line.includes('Paragraph:') ||
          line.includes('Überschrift:')) {
        if (currentSection && currentType && currentType !== 'FAQ Accordion') {
          sections.push({
            type: currentType,
            content: currentSection.trim(),
            startLine: startLine + 1,
            endLine: i
          });
        }
        currentType = 'Rich Text';
        currentSection = line + '\n';
        startLine = i;
      } else if (line.includes('[Button]')) {
        if (currentSection && currentType) {
          sections.push({
            type: currentType,
            content: currentSection.trim(),
            startLine: startLine + 1,
            endLine: i
          });
        }
        currentType = 'Text Button Link';
        currentSection = line + '\n';
        startLine = i;
      } else if (line.includes('Bildlink:')) {
        if (currentSection && currentType) {
          sections.push({
            type: currentType,
            content: currentSection.trim(),
            startLine: startLine + 1,
            endLine: i
          });
        }
        currentType = 'Image Placeholder';
        currentSection = line + '\n';
        startLine = i;
      } else if (line.includes('[Produkt]')) {
        if (currentSection && currentType) {
          sections.push({
            type: currentType,
            content: currentSection.trim(),
            startLine: startLine + 1,
            endLine: i
          });
        }
        currentType = 'Teaser Element';
        currentSection = line + '\n';
        startLine = i;
      } else {
        // Wenn kein spezifischer Marker gefunden wurde, aber wir nach FAQ Ende sind
        // und der Text nicht leer ist, als Rich Text behandeln
        if (!isFAQSection && line.trim() !== '' && !currentType) {
          currentType = 'Rich Text';
          currentSection = line + '\n';
          startLine = i;
        } else if (currentSection) {
          currentSection += line + '\n';
        }
      }
    }

    // Letztes FAQ hinzufügen (nur wenn wir noch in der FAQ-Sektion sind)
    if (isFAQSection && currentFAQ) {
      currentSection += currentFAQ.question + '\n' + currentFAQ.answer + '\n\n';
    }

    // Letzten Abschnitt hinzufügen
    if (currentSection && currentType) {
      sections.push({
        type: currentType,
        content: currentSection.trim(),
        startLine: startLine + 1,
        endLine: lines.length
      });
    }

    return sections;
  };

  const textSections = analyzeTextSections();

  return (
    <div className="page-preview">
      <div className="preview-header">
        <h2>📄 Inhaltvorschau</h2>
        <p>Inhalt der Briefing-Datei mit Content-Type-Zuordnung</p>
      </div>

      <div className="preview-container">
        <div className="preview-content">
          <div className="content-sections">
            {textSections.length > 0 ? (
              textSections.map((section, index) => (
                <div 
                  key={index} 
                  className="content-section"
                  style={{ borderLeftColor: getContentTypeColor(section.type) }}
                >
                  <div className="section-header">
                    <span className="section-icon">{getContentTypeIcon(section.type)}</span>
                    <h3>{section.type}</h3>
                    <span className="section-badge" style={{ backgroundColor: getContentTypeColor(section.type) }}>
                      Zeilen {section.startLine}-{section.endLine}
                    </span>
                  </div>
                  <div className="section-content">
                    <pre className="content-text">{section.content}</pre>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-sections">
                <p>Keine Content-Type-Abschnitte erkannt</p>
                <div className="full-text">
                  <h4>Vollständiger Inhalt:</h4>
                  <pre>{briefingText || 'Kein Inhalt verfügbar'}</pre>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="preview-sidebar">
          <div className="content-type-overview">
            <h3>Content-Type Übersicht</h3>
            <div className="type-list">
              {contentTypes.map((type, index) => (
                <div key={index} className="type-item">
                  <span 
                    className="type-color" 
                    style={{ backgroundColor: getContentTypeColor(type) }}
                  ></span>
                  <span className="type-name">{type}</span>
                  <span className="type-icon">{getContentTypeIcon(type)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="page-info">
            <h3>Seiteninformationen</h3>
            <div className="info-item">
              <label>URL-Slug:</label>
              <span>{slug || 'Nicht definiert'}</span>
            </div>
            <div className="info-item">
              <label>Meta Title:</label>
              <span>{metaInfo.metaTitle || 'Nicht definiert'}</span>
            </div>
            <div className="info-item">
              <label>Meta Description:</label>
              <span>{metaInfo.metaDescription || 'Nicht definiert'}</span>
            </div>
          </div>

          {textSections.length > 0 && (
            <div className="section-stats">
              <h3>Abschnittsstatistik</h3>
              <div className="stats-list">
                {contentTypes.map(type => {
                  const count = textSections.filter(s => s.type === type).length;
                  return (
                    <div key={type} className="stat-item">
                      <span className="stat-type">{type}</span>
                      <span className="stat-count">{count} Abschnitt{count !== 1 ? 'e' : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PagePreview; 