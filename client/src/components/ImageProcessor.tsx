import React, { useState, useRef } from 'react';
import './ImageProcessor.css';

interface ImageProcessorProps {
  briefingText: string;
  imageLinks?: any[];
  onImagesProcessed: (images: any[]) => void;
}

interface ProcessedImage {
  filename: string;
  title: string;
  description: string;
  originalUrl: string;
  downloadUrl?: string;
  lineNumber: number;
  entryId?: string;
  assetId?: string;
  isConverted?: boolean;
  copyright?: string;
  isValidImage?: boolean;
  thumbnailUrl?: string;
  analysisStatus?: 'success' | 'warning' | 'error';
  analysisMessage?: string;
  error?: string;
  uploadStatus?: 'pending' | 'uploading' | 'success' | 'error';
  uploadMessage?: string;
}

interface EditableImage extends ProcessedImage {
  editedDescription: string;
  isEditing: boolean;
}

const ImageProcessor: React.FC<ImageProcessorProps> = ({ briefingText, imageLinks = [], onImagesProcessed }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [processedImages, setProcessedImages] = useState<EditableImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debug: Log received imageLinks
  console.log('ImageProcessor: Received imageLinks from backend:', imageLinks);
  console.log('ImageProcessor: Number of imageLinks:', imageLinks.length);

  const extractImageLinks = () => {
    // Use imageLinks from backend if available, otherwise extract locally
    if (imageLinks && imageLinks.length > 0) {
      console.log('ImageProcessor: Using imageLinks from backend');
      return imageLinks;
    }
    
    console.log('ImageProcessor: Extracting imageLinks locally');
    const lines = briefingText.split('\n');
    const localImageLinks = [];
    
    console.log('Frontend: Extrahiere Bildlinks...');
    console.log(`Frontend: Durchsuche ${lines.length} Zeilen...`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Debug: Zeige alle Zeilen, die "Bild" enthalten
      if (line.toLowerCase().includes('bild')) {
        console.log(`Frontend: Zeile ${i + 1}: "${line}"`);
      }
      
      if (line.startsWith('Bildlink:')) {
        console.log(`Frontend: ✅ Bildlink gefunden in Zeile ${i + 1}: "${line}"`);
        const content = line.replace('Bildlink:', '').trim();
        if (content) {
          // Copyright-Hinweis aus Klammern extrahieren
          const copyrightMatch = content.match(/\((.*?)\)/);
          const copyright = copyrightMatch ? copyrightMatch[1].trim() : null;
          
          // URL ohne Copyright-Hinweis extrahieren
          const urlWithoutCopyright = content.replace(/\(.*?\)/g, '').trim();
          
          // Einfache Konvertierung für Frontend-Vorschau
          const isGoogleDrive = urlWithoutCopyright.includes('drive.google.com/file/d/') && urlWithoutCopyright.includes('/view');
          const downloadUrl = isGoogleDrive 
            ? urlWithoutCopyright.replace('/view', '').replace('/file/d/', '/uc?export=download&id=')
            : urlWithoutCopyright;
          
          localImageLinks.push({
            lineNumber: i + 1,
            url: downloadUrl,
            originalUrl: urlWithoutCopyright,
            originalLine: line,
            isConverted: isGoogleDrive,
            copyright: copyright
          });
          
          console.log(`Frontend:   → URL: ${urlWithoutCopyright}`);
          console.log(`Frontend:   → Download URL: ${downloadUrl}`);
          if (copyright) {
            console.log(`Frontend:   → Copyright: ${copyright}`);
          }
        }
      }
    }
    
    console.log(`Frontend: Gefundene Bildlinks: ${localImageLinks.length}`);
    return localImageLinks;
  };

  const handleProcessImages = async () => {
    setIsProcessing(true);
    setError(null);
    setProgress(null);
    
    // AbortController für Abbruch-Funktionalität
    abortControllerRef.current = new AbortController();
    
    // SSE-Verbindung für Fortschritts-Updates
    const eventSource = new EventSource('/api/progress');
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('SSE Update:', data);
        
        if (data.type === 'progress') {
          setProgress({
            current: data.current,
            total: data.total,
            message: data.message
          });
        } else if (data.type === 'complete') {
          console.log('Bildverarbeitung abgeschlossen via SSE');
          eventSource.close();
        }
      } catch (error) {
        console.error('Fehler beim Parsen der SSE-Nachricht:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE-Verbindungsfehler:', error);
      eventSource.close();
    };
    
    try {
      console.log('Starte Bildverarbeitung...');
      const formData = new FormData();
      const file = new File([briefingText], 'briefing.txt', { type: 'text/plain' });
      formData.append('briefing', file);

      const extractedImageLinks = extractImageLinks();
      setProgress({ current: 0, total: extractedImageLinks.length, message: 'Bereite Verarbeitung vor...' });

      console.log('Sende Anfrage an /api/process-images...');
      const response = await fetch('/api/process-images', {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal
      });

      console.log('Antwort erhalten:', response.status);
      
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        // Versuche, detaillierte Fehlermeldung aus der Antwort zu extrahieren
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (parseError) {
          // Ignoriere Parse-Fehler, verwende Standard-Fehlermeldung
        }
        
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      console.log('Antwort-Daten:', result);

      if (result.success) {
        // Konvertiere zu EditableImage mit editierbaren Beschreibungen
        const editableImages: EditableImage[] = result.data.images.map((image: ProcessedImage) => ({
          ...image,
          editedDescription: image.description,
          isEditing: false,
          thumbnailUrl: image.thumbnailUrl || image.downloadUrl || image.originalUrl,
          analysisStatus: image.error ? 'error' : (image.isValidImage === false ? 'warning' : 'success'),
          analysisMessage: image.error 
            ? `Fehler: ${image.error}` 
            : image.isValidImage === false 
              ? 'Standard-Beschreibung verwendet (ungültiges Bildformat)' 
              : 'KI-Analyse erfolgreich',
          uploadStatus: 'pending',
          uploadMessage: 'Bereit zum Hochladen'
        }));
        
        setProcessedImages(editableImages);
        onImagesProcessed(result.data.images);
        console.log(`${editableImages.length} Bilder verarbeitet`);
      } else {
        setError(result.error || 'Fehler bei der Bildverarbeitung');
        console.error('Bildverarbeitung fehlgeschlagen:', result.error);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Bildverarbeitung wurde abgebrochen');
        console.log('Bildverarbeitung abgebrochen');
      } else {
        let errorMessage = 'Netzwerkfehler bei der Bildverarbeitung';
        
        if (err instanceof Error) {
          // Spezifische Fehlermeldungen für verschiedene Fehlertypen
          if (err.message.includes('zu groß')) {
            errorMessage = 'Bild ist zu groß. Maximale Größe: 10MB';
          } else if (err.message.includes('timeout') || err.message.includes('timeout')) {
            errorMessage = 'Zeitüberschreitung bei der Bildverarbeitung. Bitte versuchen Sie es erneut.';
          } else if (err.message.includes('404')) {
            errorMessage = 'Bild konnte nicht gefunden werden. Bitte überprüfen Sie die URL.';
          } else if (err.message.includes('403')) {
            errorMessage = 'Zugriff auf das Bild verweigert. Bitte überprüfen Sie die Berechtigungen.';
          } else if (err.message.includes('500')) {
            errorMessage = 'Server-Fehler bei der Bildverarbeitung. Bitte versuchen Sie es später erneut.';
          } else {
            errorMessage = err.message;
          }
        }
        
        setError(errorMessage);
        console.error('Fehler bei der Bildverarbeitung:', err);
      }
    } finally {
      setIsProcessing(false);
      setProgress(null);
      abortControllerRef.current = null;
      eventSource.close();
    }
  };

  const handleUploadImage = async (index: number) => {
    const image = processedImages[index];
    
    // Status auf "uploading" setzen
    const updatedImages = [...processedImages];
    updatedImages[index].uploadStatus = 'uploading';
    updatedImages[index].uploadMessage = 'Lade zu Contentful hoch...';
    setProcessedImages(updatedImages);
    
    try {
      const response = await fetch('/api/upload-single-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: {
            ...image,
            description: image.editedDescription || image.description
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Upload fehlgeschlagen: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Erfolgreich hochgeladen
        updatedImages[index].uploadStatus = 'success';
        updatedImages[index].uploadMessage = 'Erfolgreich hochgeladen';
        updatedImages[index].entryId = result.data.entryId;
        updatedImages[index].assetId = result.data.assetId;
      } else {
        throw new Error(result.error || 'Upload fehlgeschlagen');
      }
    } catch (error) {
      // Upload fehlgeschlagen
      updatedImages[index].uploadStatus = 'error';
      updatedImages[index].uploadMessage = error instanceof Error ? error.message : 'Upload fehlgeschlagen';
    }
    
    setProcessedImages(updatedImages);
  };

  const handleAbortProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsProcessing(false);
      setProgress(null);
      setError('Bildverarbeitung wurde abgebrochen');
    }
  };

  const handleUploadAllImages = async () => {
    if (processedImages.length === 0) {
      setError('Keine Bilder zum Hochladen verfügbar');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      console.log('Starte Upload aller Bilder zu Contentful...');
      
      const response = await fetch('/api/upload-all-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images: processedImages.map(image => ({
            filename: image.filename,
            title: image.title,
            description: image.description,
            copyright: image.copyright
          }))
        })
      });

      const result = await response.json();

      if (result.success) {
        console.log('Upload erfolgreich:', result.data);
        
        // Update der Bilder mit Upload-Status
        const updatedImages = processedImages.map((image, index) => {
          const uploadResult = result.data.results[index];
          return {
            ...image,
            uploadStatus: (uploadResult.success ? 'success' : 'error') as 'success' | 'error',
            uploadMessage: uploadResult.success 
              ? `Hochgeladen (Asset: ${uploadResult.assetId})`
              : `Fehler: ${uploadResult.error}`,
            assetId: uploadResult.success ? uploadResult.assetId : null,
            entryId: uploadResult.success ? uploadResult.entryId : null
          };
        });

        setProcessedImages(updatedImages);
        
        // Erfolgsmeldung
        alert(`Upload abgeschlossen!\n\nErfolgreich: ${result.data.successCount}\nFehlgeschlagen: ${result.data.errorCount}`);
        
      } else {
        setError(result.error || 'Fehler beim Upload zu Contentful');
      }
    } catch (err) {
      console.error('Fehler beim Upload:', err);
      setError('Netzwerkfehler beim Upload zu Contentful');
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditDescription = (index: number) => {
    const updatedImages = [...processedImages];
    updatedImages[index].isEditing = true;
    setProcessedImages(updatedImages);
  };

  const handleSaveDescription = (index: number) => {
    const updatedImages = [...processedImages];
    updatedImages[index].description = updatedImages[index].editedDescription;
    updatedImages[index].isEditing = false;
    setProcessedImages(updatedImages);
  };

  const handleCancelEdit = (index: number) => {
    const updatedImages = [...processedImages];
    updatedImages[index].editedDescription = updatedImages[index].description;
    updatedImages[index].isEditing = false;
    setProcessedImages(updatedImages);
  };

  const handleDescriptionChange = (index: number, value: string) => {
    const updatedImages = [...processedImages];
    updatedImages[index].editedDescription = value;
    setProcessedImages(updatedImages);
  };

  const getAnalysisStatusIcon = (status?: string) => {
    switch (status) {
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return 'ℹ️';
    }
  };

  const getUploadStatusIcon = (status?: string) => {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'uploading':
        return '📤';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '⏳';
    }
  };

  const extractedImageLinks = extractImageLinks();

  return (
    <div className="image-processor">
      <div className="processor-header">
        <h3>🖼️ Bildverarbeitung</h3>
        <p>Automatische Bildanalyse und Import mit KI</p>
      </div>

      <div className="image-links-preview">
        <h4>Gefundene Bildlinks ({extractedImageLinks.length}):</h4>
        {extractedImageLinks.length > 0 ? (
          <div className="links-list">
            {extractedImageLinks.map((link, index) => (
              <div key={index} className="link-item">
                <span className="line-number">Zeile {link.lineNumber}:</span>
                <span className="url">{link.url}</span>
                {link.isConverted && (
                  <span className="converted-badge">Konvertiert</span>
                )}
                {link.copyright && (
                  <span className="copyright-badge">© {link.copyright}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="no-links">Keine Bildlinks gefunden</p>
        )}
      </div>

      {extractedImageLinks.length > 0 && (
        <div className="processor-actions">
          {!isProcessing ? (
            <button 
              className="btn btn-primary"
              onClick={handleProcessImages}
              disabled={isProcessing}
            >
              Bilder analysieren
            </button>
          ) : (
            <div className="processing-controls">
              <button 
                className="btn btn-danger"
                onClick={handleAbortProcessing}
              >
                Verarbeitung abbrechen
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {progress && (
        <div className="progress-indicator">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            ></div>
          </div>
          <p className="progress-text">
            {progress.message} ({progress.current}/{progress.total})
          </p>
        </div>
      )}

      {processedImages.length > 0 && (
        <div className="processed-images">
          <div className="images-header">
            <h4>Analysierte Bilder ({processedImages.length}):</h4>
          </div>
          <div className="images-grid">
            {processedImages.map((image, index) => (
              <div key={index} className="image-card">
                <div 
                  className="image-thumbnail"
                  onClick={() => {
                    if (image.originalUrl) {
                      window.open(image.originalUrl, '_blank');
                    }
                  }}
                >
                  <img 
                    src={image.thumbnailUrl} 
                    alt={image.title}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      console.log('Image failed to load:', image.thumbnailUrl);
                      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjZjBmMGYwIi8+CjxwYXRoIGQ9Ik0yNSAyNUg3NVY3NUgyNVoiIGZpbGw9IiNjY2NjY2MiLz4KPHN2ZyB4PSIzNSIgeT0iMzUiIHdpZHRoPSIzMCIgaGVpZ2h0PSIzMCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cGF0aCBkPSJNMTkgM0g1QzMuOSAzIDMgMy45IDMgNVYxOUMzIDIwLjEgMy45IDIxIDUgMjFIMTlDMjAuMSAyMSAyMSAyMC4xIDIxIDE5VjVDMjEgMy45IDIwLjEgMyAxOSAzWk0xOSAxOUg1VjVIMTlWMTlaIiBmaWxsPSIjOTk5OTk5Ii8+CjxwYXRoIGQ9Ik0xNCAxM0gxNlYxN0gxNFYxM1pNMTAgMTNIMTJWMjdIMTBWMzNaIiBmaWxsPSIjOTk5OTk5Ii8+Cjwvc3ZnPgo8L3N2Zz4K';
                    }}
                    onLoad={() => {
                      console.log('Image loaded successfully:', image.thumbnailUrl);
                    }}
                  />
                </div>
                
                <div className="image-content">
                  <div className="image-header">
                    <h5 className="image-title">{image.title}</h5>
                    <div className="analysis-status">
                      <span className={`status-icon ${image.analysisStatus}`}>
                        {getAnalysisStatusIcon(image.analysisStatus)}
                      </span>
                      <span className="status-text">{image.analysisMessage}</span>
                    </div>
                  </div>

                  <div className="image-description">
                    {image.isEditing ? (
                      <div className="edit-description">
                        <textarea
                          value={image.editedDescription}
                          onChange={(e) => handleDescriptionChange(index, e.target.value)}
                          maxLength={750}
                          rows={3}
                          placeholder="Beschreibung bearbeiten..."
                        />
                        <div className="edit-actions">
                          <button 
                            className="btn btn-sm btn-success"
                            onClick={() => handleSaveDescription(index)}
                          >
                            Speichern
                          </button>
                          <button 
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleCancelEdit(index)}
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="description-display">
                        <p>{image.description}</p>
                        <button 
                          className="btn btn-sm btn-outline"
                          onClick={() => handleEditDescription(index)}
                        >
                          ✏️ Bearbeiten
                        </button>
                      </div>
                    )}
                  </div>

                  {/* KI-Analyse Vorschau */}
                  <div className="ai-analysis-preview">
                    <h6>🤖 KI-Analyse Details:</h6>
                    <div className="analysis-details">
                      <div className="analysis-item">
                        <strong>Titel:</strong> {image.title}
                      </div>
                      <div className="analysis-item">
                        <strong>Status:</strong> 
                        <span className={`analysis-status ${image.analysisStatus}`}>
                          {getAnalysisStatusIcon(image.analysisStatus)} {image.analysisMessage}
                        </span>
                      </div>
                      {image.error && (
                        <div className="analysis-error">
                          <strong>Fehler:</strong> {image.error}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="image-details">
                    <div className="detail-item">
                      <span className="detail-label">Zeile:</span>
                      <span className="detail-value">{image.lineNumber}</span>
                    </div>
                    {image.copyright && (
                      <div className="detail-item">
                        <span className="detail-label">Copyright:</span>
                        <span className="detail-value">© {image.copyright}</span>
                      </div>
                    )}
                    <div className="detail-item">
                      <span className="detail-label">Status:</span>
                      <span className="detail-value">
                        {image.isValidImage === false ? '⚠️ Standard-Beschreibung' : '✅ KI-Analyse'}
                      </span>
                    </div>
                  </div>

                  <div className="upload-section">
                    <div className="upload-status">
                      <span className={`upload-icon ${image.uploadStatus}`}>
                        {getUploadStatusIcon(image.uploadStatus)}
                      </span>
                      <span className="upload-message">{image.uploadMessage}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          

        </div>
      )}

      {isProcessing && (
        <div className="processing-overlay">
          <div className="processing-spinner">
            <div className="spinner"></div>
            <p>Analysiere Bilder mit KI...</p>
            <p className="processing-details">
              Bilder werden heruntergeladen und analysiert
            </p>
            {progress && (
              <div className="processing-progress">
                <p>Fortschritt: {progress.current} von {progress.total} Bildern</p>
                <p className="progress-message">{progress.message}</p>
              </div>
            )}
            <button 
              className="btn btn-danger"
              onClick={handleAbortProcessing}
              style={{ marginTop: '1rem' }}
            >
              ❌ Verarbeitung abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageProcessor; 