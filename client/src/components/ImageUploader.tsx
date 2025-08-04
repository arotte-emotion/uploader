import React, { useState, useRef } from 'react';
import './ImageProcessor.css'; // Verwende die gleichen Styles wie ImageProcessor

interface ImageUploaderProps {
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
  editedTitle?: string;
  isEditingTitle?: boolean;
  file?: File; // Für hochgeladene Dateien
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImagesProcessed }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedImages, setProcessedImages] = useState<EditableImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Datei-Upload Handler
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;


    
    // Setze sofort den Processing-Status
    setIsProcessing(true);
    setError(null);
    
    // Erstelle Mock-ImageLinks für die Dateien (wie im ImageProcessor)
    const mockImageLinks = Array.from(files).map((file, index) => ({
      lineNumber: index + 1,
      url: URL.createObjectURL(file), // Temporäre URL für Vorschau
      originalUrl: file.name,
      originalLine: `Bildlink: ${file.name}`,
      isConverted: false,
      copyright: '',
      file: file // Speichere die echte Datei
    }));

    // Starte automatisch die Verarbeitung mit kurzer Verzögerung
    setTimeout(() => {
      handleProcessImages(mockImageLinks);
    }, 100);
  };

  // Google Drive Ordner Handler
  const handleDriveFolderProcess = async () => {
    if (!driveFolderUrl.trim()) {
      setError('Bitte geben Sie eine Google Drive Ordner-URL ein');
      return;
    }

    console.log('Verarbeite Google Drive Ordner:', driveFolderUrl);
    
    // Erstelle Mock-ImageLink für Drive Ordner
    const mockImageLink = [{
      lineNumber: 1,
      url: driveFolderUrl,
      originalUrl: driveFolderUrl,
      originalLine: `Bildlink: ${driveFolderUrl}`,
      isConverted: true,
      copyright: '',
      isDriveFolder: true
    }];

    handleProcessImages(mockImageLink);
  };

  // Hauptverarbeitungsfunktion (basiert auf ImageProcessor.handleProcessImages)
  const handleProcessImages = async (imageLinks?: any[]) => {
    console.log('=== handleProcessImages gestartet ===');
    console.log('imageLinks:', imageLinks);
    
    if (!imageLinks || imageLinks.length === 0) {
      setError('Keine Bilder zum Verarbeiten vorhanden');
      setIsProcessing(false);
      return;
    }

    // AbortController für Abbruch-Funktionalität
    abortControllerRef.current = new AbortController();
    
    // Bulk-Upload API verwendet keine SSE, sondern direkten Response
    console.log('Bulk-Upload API - kein SSE erforderlich');
    
    try {
      console.log('Starte Bildverarbeitung für Bulk-Upload...');
      console.log(`Verarbeite ${imageLinks.length} Bilder`);
      
      // Verwende die Bulk-Upload API (erwartet nur 'images' Parameter)
      const formData = new FormData();
      
      // Für Datei-Uploads - füge nur die Dateien hinzu
      let hasFiles = false;
      if (imageLinks && imageLinks[0]?.file) {
        imageLinks.forEach((link, index) => {
          if (link.file) {
            formData.append('images', link.file);
            console.log(`Füge Datei ${index + 1} hinzu: ${link.file.name} (${link.file.size} bytes)`);
            hasFiles = true;
          }
        });
      }
      
      // Für Google Drive Ordner
      if (imageLinks && imageLinks[0]?.isDriveFolder) {
        formData.append('driveFolderUrl', driveFolderUrl);
        console.log(`Füge Drive Ordner URL hinzu: ${driveFolderUrl}`);
      }
      
      // Bulk-Upload API braucht kein Briefing-File
      console.log(`Bulk-Upload bereit: ${hasFiles ? 'Dateien' : 'Drive-Ordner'} werden verarbeitet`);

      const totalImages = imageLinks.length;
      setProgress({ current: 0, total: totalImages, message: 'Bereite KI-Analyse vor...' });

      console.log('Sende Anfrage an /api/process-bulk-images (speziell für Bulk-Upload)...');

      const response = await fetch('/api/process-bulk-images', {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal
      });

      console.log('Antwort erhalten:', response.status, response.statusText);
      
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorData = await response.json();
          console.error('Error Response:', errorData);
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (parseError) {
          console.error('Fehler beim Parsen der Fehlerantwort:', parseError);
        }
        
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      console.log('Erfolgreiche Antwort-Daten:', result);

      if (result.success && result.data) {
        // Die Bulk-Upload API gibt processedImages zurück
        const images = result.data.processedImages || result.data.images || [];
        
        // Konvertiere zu EditableImage mit editierbaren Beschreibungen
        const editableImages: EditableImage[] = images.map((image: any, index: number) => ({
          filename: image.filename,
          title: image.title || 'Unbekannter Titel',
          description: image.description || 'Keine Beschreibung verfügbar',
          originalUrl: image.originalUrl || imageLinks[index]?.url || '',
          downloadUrl: image.downloadUrl,
          lineNumber: image.lineNumber || index + 1,
          entryId: image.entryId,
          assetId: image.assetId,
          isConverted: image.isConverted || false,
        copyright: image.copyright || '',
          isValidImage: image.isValidImage !== false,
          thumbnailUrl: image.thumbnailUrl || imageLinks[index]?.url,
          analysisStatus: image.analysisStatus || (image.error ? 'error' : 'success'),
          analysisMessage: image.analysisMessage || (image.error ? `Fehler: ${image.error}` : 'KI-Analyse erfolgreich'),
          error: image.error,
          uploadStatus: image.uploadStatus || 'success',
          uploadMessage: image.uploadMessage || 'Erfolgreich verarbeitet',
          editedDescription: image.description || 'Keine Beschreibung verfügbar',
        isEditing: false,
          editedTitle: image.title || 'Unbekannter Titel',
          isEditingTitle: false,
          file: imageLinks[index]?.file // Behalte die originale Datei-Referenz
        }));
        
        console.log('Editierbare Bilder erstellt:', editableImages);
        setProcessedImages(editableImages);
        onImagesProcessed(images);
        console.log(`✅ ${editableImages.length} Bilder erfolgreich mit KI analysiert`);
        console.log(`📊 Statistik: ${result.data.successfulUploads || 0} erfolgreich, ${result.data.failedUploads || 0} fehlgeschlagen`);
      } else {
        console.error('Unerwartete Antwortstruktur:', result);
        setError(result.error || 'Fehler bei der Bildverarbeitung - unerwartete Antwortstruktur');
      }
    } catch (err) {
      console.error('Fehler in handleProcessImages:', err);
      
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Bildverarbeitung wurde abgebrochen');
        console.log('Bildverarbeitung abgebrochen');
      } else {
        let errorMessage = 'Netzwerkfehler bei der Bildverarbeitung';
        
        if (err instanceof Error) {
          errorMessage = err.message;
        }
        
        setError(errorMessage);
        console.error('Detaillierter Fehler bei der Bildverarbeitung:', err);
      }
    } finally {
      setIsProcessing(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleAbortProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Bearbeitungsfunktionen (identisch mit ImageProcessor)
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

  const handleRemoveImage = (index: number) => {
    console.log(`Bild entfernt: ${index}`);
    const updatedImages = processedImages.filter((_, i) => i !== index);
    setProcessedImages(updatedImages);
  };

  // Titel-Bearbeitung Handler
  const handleEditTitle = (index: number) => {
    const updatedImages = [...processedImages];
    updatedImages[index].isEditingTitle = true;
    updatedImages[index].editedTitle = updatedImages[index].title;
    setProcessedImages(updatedImages);
  };

  const handleSaveTitle = (index: number) => {
    const updatedImages = [...processedImages];
    updatedImages[index].title = updatedImages[index].editedTitle || updatedImages[index].title;
    updatedImages[index].isEditingTitle = false;
    setProcessedImages(updatedImages);
  };

  const handleCancelTitleEdit = (index: number) => {
    const updatedImages = [...processedImages];
    updatedImages[index].editedTitle = updatedImages[index].title;
    updatedImages[index].isEditingTitle = false;
    setProcessedImages(updatedImages);
  };

  const handleTitleChange = (index: number, value: string) => {
    const updatedImages = [...processedImages];
    updatedImages[index].editedTitle = value;
    setProcessedImages(updatedImages);
  };

  // Status-Icons (identisch mit ImageProcessor)
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

  return (
    <div className="image-processor"> {/* Verwende die gleiche CSS-Klasse */}
      <div style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        background: 'orange',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        zIndex: 9999,
        fontSize: '14px',
        fontWeight: 'bold'
      }}>
        🔧 CACHE-BUSTER V6.0 - {new Date().toLocaleTimeString()}
      </div>
      <div className="processor-header">
        <h3>🖼️ Bild-Upload & Verarbeitung</h3>
        <p>Laden Sie Bilder direkt hoch oder verwenden Sie Google Drive Ordner für automatische KI-Analyse</p>
      </div>

      {/* Upload-Optionen */}
      <div className="upload-options" style={{ marginBottom: '2rem' }}>
        <div className="upload-method" style={{ marginBottom: '1rem' }}>
          <h4>📁 Dateien hochladen</h4>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileUpload}
            ref={fileInputRef}
            style={{ display: 'none' }}
          />
          <button 
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            📁 Bilder auswählen
          </button>
        </div>

        <div className="upload-method">
          <h4>🔗 Google Drive Ordner</h4>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <input
              type="text"
              value={driveFolderUrl}
              onChange={(e) => setDriveFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
              disabled={isProcessing}
            />
            <button 
              className="btn btn-primary"
              onClick={handleDriveFolderProcess}
              disabled={isProcessing || !driveFolderUrl.trim()}
            >
              🔗 Ordner verarbeiten
            </button>
          </div>
        </div>
      </div>

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

      {/* Verarbeitete Bilder (identisch mit ImageProcessor) */}
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
                    if (image.thumbnailUrl) {
                      window.open(image.thumbnailUrl, '_blank');
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
                    {image.isEditingTitle ? (
                      <div className="edit-title">
                      <input
                        type="text"
                          value={image.editedTitle || image.title}
                          onChange={(e) => handleTitleChange(index, e.target.value)}
                          maxLength={200}
                          placeholder="Titel bearbeiten..."
                          className="title-input"
                          autoFocus
                          style={{ 
                            width: '100%', 
                            marginBottom: '0.5rem',
                            padding: '10px',
                            border: '3px solid #32cd32',
                            borderRadius: '6px',
                            fontSize: '16px',
                            zIndex: 999,
                            position: 'relative',
                            pointerEvents: 'auto',
                            cursor: 'text',
                            backgroundColor: 'white',
                            boxSizing: 'border-box'
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Input field clicked');
                          }}
                          onFocus={(e) => {
                            console.log('Input field focused');
                            e.target.select();
                          }}
                      />
                      <div className="edit-actions">
                        <button 
                          className="btn btn-sm btn-success"
                            onClick={() => handleSaveTitle(index)}
                            style={{ 
                              cursor: 'pointer',
                              zIndex: 10,
                              position: 'relative'
                            }}
                        >
                          ✅ Speichern
                        </button>
                        <button 
                          className="btn btn-sm btn-secondary"
                            onClick={() => handleCancelTitleEdit(index)}
                            style={{ 
                              cursor: 'pointer',
                              zIndex: 10,
                              position: 'relative'
                            }}
                        >
                          ❌ Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                      <div className="title-display" style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '0.5rem',
                        width: '100%'
                      }}>
                        <h5 className="image-title" style={{ 
                          margin: 0,
                          fontSize: '1.1rem',
                          fontWeight: '600',
                          color: '#1a4d2e',
                          wordWrap: 'break-word'
                        }}>
                          {image.title}
                        </h5>
                        <button 
                          className="btn btn-sm btn-outline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Titel bearbeiten clicked for index:', index);
                            handleEditTitle(index);
                          }}
                          style={{ 
                            cursor: 'pointer',
                            zIndex: 10,
                            position: 'relative',
                            alignSelf: 'flex-start',
                            pointerEvents: 'auto'
                          }}
                        >
                          ✏️ Titel bearbeiten
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="image-description" style={{ marginBottom: '1.5rem' }}>
                    {image.isEditing ? (
                      <div className="edit-description">
                        <textarea
                          value={image.editedDescription}
                          onChange={(e) => handleDescriptionChange(index, e.target.value)}
                          maxLength={750}
                          rows={5}
                          placeholder="Beschreibung bearbeiten..."
                          style={{ 
                            width: '100%',
                            padding: '0.75rem',
                            border: '2px solid #32cd32',
                            borderRadius: '8px',
                            fontSize: '0.95rem',
                            lineHeight: '1.4',
                            resize: 'vertical',
                            minHeight: '120px'
                          }}
                        />
                        <div className="edit-actions">
                          <button 
                            className="btn btn-sm btn-success"
                            onClick={() => handleSaveDescription(index)}
                            style={{ 
                              cursor: 'pointer',
                              zIndex: 10,
                              position: 'relative'
                            }}
                          >
                            ✅ Speichern
                        </button>
                        <button 
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleCancelEdit(index)}
                            style={{ 
                              cursor: 'pointer',
                              zIndex: 10,
                              position: 'relative'
                            }}
                          >
                            ❌ Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="description-display">
                        <div 
                          style={{ 
                            color: '#2c3e50',
                            lineHeight: '1.6',
                            marginBottom: '1rem',
                            fontSize: '0.95rem',
                            maxHeight: 'none',
                            height: 'auto',
                            overflow: 'visible',
                            whiteSpace: 'pre-wrap',
                            wordWrap: 'break-word',
                            display: 'block',
                            width: '100%',
                            minHeight: '300px',
                            border: '2px solid red',
                            padding: '15px',
                            backgroundColor: '#f9f9f9',
                            boxSizing: 'border-box'
                          }}
                        >
                          {image.description}
                        </div>
                        
                        {/* SEPARATE BUTTON CONTAINER - IMMER SICHTBAR */}
                        <div style={{ 
                          display: 'block',
                          width: '100%',
                          marginTop: '20px',
                          marginBottom: '20px',
                          clear: 'both',
                          backgroundColor: 'yellow',
                          padding: '15px',
                          border: '3px solid blue',
                          borderRadius: '8px'
                        }}>
                          <h4 style={{ margin: '0 0 10px 0', color: 'black' }}>AKTIONEN:</h4>
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              alert('Beschreibung bearbeiten clicked!');
                              console.log('Beschreibung bearbeiten clicked for index:', index);
                              handleEditDescription(index);
                            }}
                            style={{ 
                              cursor: 'pointer',
                              zIndex: 999,
                              position: 'relative',
                              pointerEvents: 'auto',
                              display: 'inline-block',
                              marginRight: '15px',
                              marginBottom: '10px',
                              padding: '12px 24px',
                              backgroundColor: '#32cd32',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '18px',
                              fontWeight: 'bold',
                              boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                            }}
                          >
                            ✏️ BESCHREIBUNG BEARBEITEN
                          </button>
                          
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              alert('Entfernen clicked!');
                              console.log('Entfernen clicked for index:', index);
                              handleRemoveImage(index);
                            }}
                            style={{ 
                              cursor: 'pointer',
                              zIndex: 999,
                              position: 'relative',
                              pointerEvents: 'auto',
                              display: 'inline-block',
                              marginBottom: '10px',
                              padding: '12px 24px',
                              backgroundColor: '#e74c3c',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '18px',
                              fontWeight: 'bold',
                              boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                            }}
                          >
                            🗑️ ENTFERNEN
                        </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {image.copyright && (
                    <div className="image-details">
                      <div className="detail-item">
                        <span className="detail-label">Copyright:</span>
                        <span className="detail-value">© {image.copyright}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Upload-Button entfernt - Workflow jetzt über Bildvorschau */}
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

export default ImageUploader; 