import React from 'react';
import './ImageAnalysisPreview.css';

interface ProcessedImage {
  filename: string;
  title: string;
  description: string;
  originalUrl: string;
  downloadUrl: string;
  lineNumber: number;
  entryId: string | null;
  assetId: string | null;
  isConverted: boolean;
  copyright: string;
  isValidImage: boolean;
  thumbnailUrl: string;
  analysisStatus: 'success' | 'error' | 'pending';
  analysisMessage: string;
  error: string | null;
}

interface ImageAnalysisPreviewProps {
  images: ProcessedImage[];
  onClose: () => void;
}

const ImageAnalysisPreview: React.FC<ImageAnalysisPreviewProps> = ({ images, onClose }) => {
  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'pending':
        return '⏳';
      default:
        return '❓';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'error';
      case 'pending':
        return 'pending';
      default:
        return 'unknown';
    }
  };

  return (
    <div className="image-analysis-preview">
      <div className="preview-header">
        <h2>🖼️ KI-Bildanalyse Vorschau</h2>
        <p>Ergebnisse der automatischen Bildanalyse ({images.length} Bilder)</p>
        <button className="close-button" onClick={onClose}>
          ✕ Schließen
        </button>
      </div>

      <div className="preview-stats">
        <div className="stat-card">
          <span className="stat-number">{images.length}</span>
          <span className="stat-label">Bilder analysiert</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{images.filter(img => img.analysisStatus === 'success').length}</span>
          <span className="stat-label">Erfolgreich</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{images.filter(img => img.analysisStatus === 'error').length}</span>
          <span className="stat-label">Fehler</span>
        </div>
      </div>

      <div className="images-grid">
        {images.map((image, index) => (
          <div key={index} className={`image-preview-card ${getStatusColor(image.analysisStatus)}`}>
            <div className="image-preview-header">
              <div className="image-info">
                <h4>{image.filename}</h4>
                <span className="line-number">Zeile {image.lineNumber}</span>
              </div>
              <div className={`status-badge ${getStatusColor(image.analysisStatus)}`}>
                {getStatusIcon(image.analysisStatus)} {image.analysisStatus}
              </div>
            </div>

            <div className="image-preview-content">
              <div className="image-thumbnail">
                <img 
                  src={image.thumbnailUrl} 
                  alt={image.title}
                  onClick={() => window.open(image.thumbnailUrl, '_blank')}
                  style={{ cursor: 'pointer' }}
                  title="Klicken für Vollansicht"
                />
              </div>

              <div className="image-details">
                <div className="ai-analysis">
                  <h5>🤖 KI-Analyse</h5>
                  <div className="analysis-result">
                    <strong>Titel:</strong> {image.title}
                  </div>
                  <div className="analysis-result">
                    <strong>Beschreibung:</strong> {image.description}
                  </div>
                  <div className="analysis-message">
                    {image.analysisMessage}
                  </div>
                </div>

                <div className="image-metadata">
                  <h5>📋 Metadaten</h5>
                  <div className="metadata-item">
                    <strong>Original URL:</strong> 
                    <a href={image.originalUrl} target="_blank" rel="noopener noreferrer">
                      {image.originalUrl}
                    </a>
                  </div>
                  {image.copyright && (
                    <div className="metadata-item">
                      <strong>Copyright:</strong> {image.copyright}
                    </div>
                  )}
                  {image.isConverted && (
                    <div className="metadata-item">
                      <strong>Google Drive Link konvertiert</strong>
                    </div>
                  )}
                </div>

                {image.error && (
                  <div className="error-details">
                    <h5>❌ Fehler</h5>
                    <div className="error-message">
                      {image.error}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="preview-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Schließen
        </button>
        {/* Upload-Button entfernt - nur "Weiter zum Contentful Upload" in App.tsx */}
      </div>
    </div>
  );
};

export default ImageAnalysisPreview; 