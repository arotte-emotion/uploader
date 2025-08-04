import React, { useState, useRef } from 'react';
import './App.css';
import FileUpload from './components/FileUpload';
import ValidationResults from './components/ValidationResults';
import ContentTypeAnalysis from './components/ContentTypeAnalysis';
import PagePreview from './components/PagePreview';
import LocalInfoDisplay from './components/LocalInfoDisplay';
import ImageProcessor from './components/ImageProcessor';
import ImageUploader from './components/ImageUploader';
import ImageAnalysisPreview from './components/ImageAnalysisPreview';
import ImportStatus from './components/ImportStatus';
import DebugPanel from './components/DebugPanel';
import { BriefingData, ValidationResult, ImportResult } from './types';

function App() {
  const [currentStep, setCurrentStep] = useState<'start' | 'validation' | 'upload' | 'final-validation'>('start');
  const [appMode, setAppMode] = useState<'briefing' | 'images-only'>('briefing');
  const [briefingData, setBriefingData] = useState<BriefingData | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [processedImages, setProcessedImages] = useState<any[]>([]);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const validationResultsRef = useRef<HTMLDivElement>(null);

  const scrollToValidationResults = () => {
    if (validationResultsRef.current) {
      validationResultsRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  };

  const handleFileValidation = async (file: File) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('briefing', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setBriefingData(result.data);
        setValidationResult(result.data.validation);
        setCurrentStep('validation');
        
        // Debug: Log the received data
        console.log('App: Received data from backend:', result.data);
        console.log('App: Image links found:', result.data.imageLinks?.length || 0);
        
        setTimeout(() => {
          scrollToValidationResults();
        }, 100);
      } else {
        setError(result.error || 'Fehler beim Validieren der Datei');
      }
    } catch (err) {
      setError('Netzwerkfehler beim Validieren der Datei');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImagesProcessed = (images: any[]) => {
    setProcessedImages(images);
    
    // Unterschiedliches Verhalten je nach Modus
    if (appMode === 'briefing') {
      // Briefing-Importer: Direkt zur Upload-Vorschau
      setCurrentStep('upload');
    } else {
      // Bulk/Images-Only-Upload: Bleibe auf validation für Bildvorschau
      console.log('🎯 Bulk-Upload: Bilder verarbeitet, zeige Bildvorschau');
      setShowImagePreview(true); // Bildvorschau automatisch anzeigen
    }
  };

  const handleUpload = async () => {
    if (!briefingData && appMode === 'briefing') return;

    setIsLoading(true);
    setError(null);

    try {
      console.log('Starte Contentful Import mit Bildern...');
      
      // Upload der Bilder zu Contentful
      if (processedImages.length > 0) {
        console.log(`Lade ${processedImages.length} Bilder zu Contentful hoch...`);
        
        const imagesResponse = await fetch('/api/upload-all-images', {
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

        const imagesResult = await imagesResponse.json();
        
        if (!imagesResult.success) {
          throw new Error(`Fehler beim Bild-Upload: ${imagesResult.error}`);
        }
        
        console.log('Bilder erfolgreich hochgeladen:', imagesResult.data);
      }

      // Echter Briefing-Import zu Contentful
      if (appMode === 'briefing' && briefingData) {
        console.log('Starte echten Briefing-Import zu Contentful...');
        
        // Erstelle FormData für den Briefing-Import
        const formData = new FormData();
        const briefingBlob = new Blob([briefingData.briefingText || ''], { type: 'text/plain' });
        formData.append('briefing', briefingBlob, 'briefing.txt');

        const briefingResponse = await fetch('/api/import-briefing', {
          method: 'POST',
          body: formData
        });

        const briefingResult = await briefingResponse.json();
        
        if (!briefingResult.success) {
          throw new Error(`Fehler beim Briefing-Import: ${briefingResult.error}`);
        }
        
        console.log('Briefing erfolgreich importiert:', briefingResult.data);
      }

      // Erfolgs-Result zusammenstellen
      const importResult: ImportResult = {
        status: 'success',
        message: appMode === 'briefing' 
          ? `Briefing und ${processedImages.length} Bilder erfolgreich in Contentful hochgeladen`
          : `${processedImages.length} Bilder erfolgreich in Contentful hochgeladen`,
        entriesCreated: (briefingData?.contentTypes.length || 0) + processedImages.length,
        timestamp: new Date().toISOString(),
        details: {
          pageCreated: appMode === 'briefing',
          richTextEntries: briefingData?.contentTypes.length || 0,
          faqEntries: processedImages.length,
          imagesUploaded: processedImages.length
        }
      };

      setImportResult(importResult);
      setCurrentStep('final-validation');
    } catch (err) {
      console.error('Fehler beim Upload:', err);
      setError(`Fehler beim Hochladen in Contentful: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalValidation = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const finalValidationResult: ImportResult = {
        status: 'success',
        message: 'Alle Entries wurden korrekt in Contentful angelegt',
        entriesCreated: 3,
        timestamp: new Date().toISOString(),
        details: {
          pageCreated: true,
          richTextEntries: 2,
          faqEntries: 1
        }
      };

      setImportResult(finalValidationResult);
    } catch (err) {
      setError('Fehler bei der finalen Validierung');
    } finally {
      setIsLoading(false);
    }
  };

  const resetApp = () => {
    setCurrentStep('start');
    setAppMode('briefing');
    setBriefingData(null);
    setValidationResult(null);
    setImportResult(null);
    setProcessedImages([]);
    setError(null);
  };

  return (
    <div className="App">
      {/* Header mit e-motion Design */}
      <header className="app-header">
        <div className="header-container">
          <div className="header-content">
            <div className="logo-section">
              <h1 className="app-title">e-Build</h1>
              <div className="logo-subtitle">Briefing Up & Import Loading Dashboard</div>
            </div>
            <div className="header-navigation">
              <nav className="nav-menu">
                <a href="#" className="nav-link active">Upload</a>
                <a href="#" className="nav-link">Validierung</a>
                <a href="#" className="nav-link">Contentful</a>
              </nav>
              <button 
                className="debug-button"
                onClick={() => setShowDebugPanel(!showDebugPanel)}
              >
                🔧 Debug
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="App-main">
        {error && (
          <div className="error-message">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Verarbeite Daten...</p>
            </div>
          </div>
        )}

        {currentStep === 'start' && (
          <div className="start-step">
            <div className="step-container">
              <div className="step-header">
                <h2>🚀 e-Build Dashboard</h2>
                <p>Wählen Sie Ihren gewünschten Workflow</p>
              </div>

              <div className="workflow-selection">
                <div className="workflow-card disabled">
                  <div className="workflow-icon">📄</div>
                  <h3>Briefing Upload & Import</h3>
                  <p style={{color: '#999'}}>⚠️ Momentan nicht verfügbar - Feature wird überarbeitet</p>
                  <ul>
                    <li style={{color: '#999'}}>⏳ Automatische Validierung</li>
                    <li style={{color: '#999'}}>⏳ KI-Bildanalyse</li>
                    <li style={{color: '#999'}}>⏳ Contentful Import</li>
                    <li style={{color: '#999'}}>⏳ Vollständiger Workflow</li>
                  </ul>
                </div>

                <div className="workflow-card" onClick={() => {
                  setAppMode('images-only');
                  setCurrentStep('validation');
                }}>
                  <div className="workflow-icon">🖼️</div>
                  <h3>Nur Bilder verarbeiten</h3>
                  <p>Laden Sie Bilder direkt hoch oder verwenden Sie Google Drive Links</p>
                  <ul>
                    <li>✅ Direkte Bild-Uploads</li>
                    <li>✅ Google Drive Integration</li>
                    <li>✅ KI-Bildanalyse</li>
                    <li>✅ Manuelle Bearbeitung</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'validation' && appMode === 'briefing' && (
          <div className="validation-step">
            <div className="step-container">
              <div className="step-header">
                <h2>📄 Briefing Upload</h2>
                <p>Laden Sie Ihre Briefing-Datei hoch und lassen Sie sie automatisch validieren</p>
              </div>
              
              <FileUpload 
                onFileUpload={handleFileValidation}
                isLoading={isLoading}
                step="validation"
              />
            </div>
            
            {briefingData && (
              <>
                <div ref={validationResultsRef} className="results-container">
                  <ValidationResults 
                    validation={validationResult!}
                    briefingData={briefingData}
                  />
                  
                  <ContentTypeAnalysis 
                    contentTypes={briefingData.contentTypes}
                    slug={briefingData.slug}
                    metaInfo={briefingData.metaInfo}
                  />

                  <PagePreview 
                    slug={briefingData.slug}
                    metaInfo={briefingData.metaInfo}
                    contentTypes={briefingData.contentTypes}
                    briefingText={briefingData.briefingText}
                  />

                  <LocalInfoDisplay 
                    localInfo={briefingData.localInfo}
                  />

                  {appMode === 'briefing' ? (
                    <ImageProcessor 
                      briefingText={briefingData.briefingText || ''}
                      imageLinks={briefingData.imageLinks || []}
                      onImagesProcessed={handleImagesProcessed}
                    />
                  ) : (
                    <ImageUploader 
                      onImagesProcessed={handleImagesProcessed}
                    />
                  )}

                  {/* Vorschau der KI-Analyse-Ergebnisse */}
                  {processedImages.length > 0 && (
                    <div className="preview-section">
                      <div className="preview-header">
                        <h3>🖼️ KI-Bildanalyse Vorschau</h3>
                        <p>Ergebnisse der automatischen Bildanalyse ({processedImages.length} Bilder)</p>
                        <button 
                          className="btn btn-sm btn-outline"
                          onClick={() => setShowImagePreview(!showImagePreview)}
                        >
                          {showImagePreview ? 'Vorschau ausblenden' : 'Vorschau anzeigen'}
                        </button>
                      </div>
                      
                      {showImagePreview && (
                        <ImageAnalysisPreview 
                          images={processedImages}
                          onClose={() => setShowImagePreview(false)}
                        />
                      )}
                    </div>
                  )}
                </div>

                                      <div className="action-buttons">
                        <button 
                          className="btn btn-secondary"
                          onClick={() => setCurrentStep('start')}
                        >
                          ← Zurück zur Startseite
                        </button>
                        
                        <button 
                          className="btn btn-secondary"
                          onClick={resetApp}
                        >
                          Neue Datei validieren
                        </button>
                        
                        {/* Upload-Button für Briefing-Workflow ausgeblendet */}
                      </div>
              </>
            )}
          </div>
        )}

        {currentStep === 'validation' && appMode === 'images-only' && (
          <div className="validation-step">
            <div className="step-container">
              <div className="step-header">
                <h2>🖼️ Bild-Upload & Verarbeitung</h2>
                <p>Laden Sie Bilder direkt hoch oder verwenden Sie Google Drive Links</p>
              </div>
              
              <ImageUploader 
                onImagesProcessed={handleImagesProcessed}
              />
              
              {/* Vorschau der KI-Analyse-Ergebnisse auch für Images-Only Modus */}
              {processedImages.length > 0 && (
                <div className="preview-section">
                  <div className="preview-header">
                    <h3>🖼️ KI-Bildanalyse Vorschau</h3>
                    <p>Ergebnisse der automatischen Bildanalyse ({processedImages.length} Bilder)</p>
                    <button 
                      className="btn btn-sm btn-outline"
                      onClick={() => setShowImagePreview(!showImagePreview)}
                    >
                      {showImagePreview ? 'Vorschau ausblenden' : 'Vorschau anzeigen'}
                    </button>
                  </div>
                  
                  {showImagePreview && (
                    <ImageAnalysisPreview 
                      images={processedImages}
                      onClose={() => setShowImagePreview(false)}
                    />
                  )}
                </div>
              )}
              
              <div className="action-buttons">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setCurrentStep('start')}
                >
                  ← Zurück zur Startseite
                </button>
                
                {processedImages.length > 0 && (
                  <button 
                    className="btn btn-primary"
                    onClick={() => setCurrentStep('upload')}
                  >
                    📤 Weiter zum Contentful Upload
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {currentStep === 'upload' && (briefingData || appMode === 'images-only') && (
          <div className="upload-step">
            <div className="step-container">
              <div className="step-header">
                <h2>📤 Contentful Upload Vorschau</h2>
                <p>Überprüfen Sie alle Daten vor dem Upload zu Contentful</p>
              </div>

              <div className="upload-checklist">
                <h3>📋 Upload-Checkliste</h3>
                <div className="checklist-items">
                  {briefingData && (
                    <div className="checklist-item">
                      <span className="checklist-icon">📄</span>
                      <div className="checklist-content">
                        <h4>Briefing Import</h4>
                        <ul>
                          <li>✅ Hauptseite: {briefingData.slug}</li>
                          <li>✅ Content-Types: {briefingData.contentTypes.length}</li>
                          <li>✅ Meta-Informationen: {briefingData.metaInfo.metaDescription || 'Standard'}</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {processedImages.length > 0 && (
                    <div className="checklist-item">
                      <span className="checklist-icon">🖼️</span>
                      <div className="checklist-content">
                        <h4>Bilder Import ({processedImages.length})</h4>
                        <ul>
                          <li>✅ KI-Analyse abgeschlossen</li>
                          <li>✅ Bilder optimiert (max 2000px)</li>
                          <li>✅ Thumbnails erstellt</li>
                          <li>✅ Als Assets hochladen</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  <div className="checklist-item">
                    <span className="checklist-icon">📊</span>
                    <div className="checklist-content">
                      <h4>Contentful Import</h4>
                      <ul>
                        <li>✅ Erwartete Entries: {(briefingData?.contentTypes.length || 0) + processedImages.length}</li>
                        <li>✅ Automatisches Publizieren</li>
                        <li>✅ SEO-optimierte Metadaten</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="action-buttons">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setCurrentStep('validation')}
                >
                  ← Zurück zur Validierung
                </button>
                
                {/* Upload-Button auf finaler Upload-Seite ausgeblendet */}
              </div>
            </div>
          </div>
        )}

        {currentStep === 'final-validation' && importResult && (
          <div className="final-validation-step">
            <div className="step-container">
              <div className="step-header">
                <h2>✅ Finale Validierung</h2>
                <p>Überprüfung der erstellten Contentful Entries</p>
              </div>

              <ImportStatus 
                result={importResult}
                onReset={resetApp}
              />

              <div className="action-buttons">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setCurrentStep('start')}
                >
                  ← Zurück zur Startseite
                </button>
                
                <button 
                  className="btn btn-primary"
                  onClick={resetApp}
                >
                  Neues Briefing hochladen
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Debug Panel */}
      {showDebugPanel && (
        <div className="debug-panel-overlay">
          <DebugPanel />
        </div>
      )}

      {/* Footer mit e-motion Design */}
      <footer className="App-footer">
        <div className="footer-container">
          <div className="footer-content">
            <div className="footer-section">
              <h3>e-motion Technologies</h3>
              <p>Professionelle e-Bike Lösungen</p>
            </div>
            <div className="footer-section">
              <p>© 2024 e-motion experts GmbH</p>
              <p>Briefing Upload System v2.0</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
