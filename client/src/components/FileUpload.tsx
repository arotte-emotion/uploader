import React, { useState, useRef } from 'react';
import './FileUpload.css';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  isLoading: boolean;
  step?: 'validation' | 'upload';
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, isLoading, step = 'validation' }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        setSelectedFile(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        setSelectedFile(file);
      }
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      onFileUpload(selectedFile);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStepText = () => {
    if (step === 'validation') {
      return {
        title: 'Briefing-Datei zur Validierung auswählen',
        description: 'Wählen Sie eine .txt Datei aus oder ziehen Sie sie hierher',
        buttonText: 'Validieren',
        processingText: 'Validiere...'
      };
    } else {
      return {
        title: 'Briefing-Datei zum Hochladen auswählen',
        description: 'Wählen Sie eine .txt Datei aus oder ziehen Sie sie hierher',
        buttonText: 'Hochladen',
        processingText: 'Hochladen...'
      };
    }
  };

  const stepText = getStepText();

  return (
    <div className="file-upload-container">
      <div className="upload-header">
        <h2>{stepText.title}</h2>
        <p>{stepText.description}</p>
      </div>

      <div 
        className={`upload-area ${isDragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="upload-content">
          <div className="upload-icon">
            📄
          </div>
          
          {!selectedFile ? (
            <>
              <h3>Datei auswählen oder hierher ziehen</h3>
              <p>Unterstützte Formate: .txt</p>
              <p>Maximale Dateigröße: 5MB</p>
              
              <button 
                className="btn btn-primary"
                onClick={handleBrowseClick}
              >
                Datei auswählen
              </button>
            </>
          ) : (
            <>
              <h3>Ausgewählte Datei</h3>
              <div className="file-info">
                <p><strong>Name:</strong> {selectedFile.name}</p>
                <p><strong>Größe:</strong> {formatFileSize(selectedFile.size)}</p>
                <p><strong>Typ:</strong> {selectedFile.type || 'text/plain'}</p>
              </div>
              
              <button 
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={isLoading}
              >
                {isLoading ? stepText.processingText : stepText.buttonText}
              </button>
              
              <button 
                className="btn btn-secondary"
                onClick={() => setSelectedFile(null)}
                disabled={isLoading}
              >
                Andere Datei wählen
              </button>
            </>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,text/plain"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <div className="upload-help">
        <h4>Hinweise:</h4>
        <ul>
          <li>Nur .txt Dateien werden unterstützt</li>
          <li>Die Datei muss das korrekte Briefing-Format haben</li>
          <li>Erforderliche Felder: Slug, MT:, MD:</li>
          <li>Der [Produkt] oder [Produkte] Marker ist optional</li>
          <li>local: für Contentful Local-Felder (wird nicht als Rich Text verarbeitet)</li>
        </ul>
      </div>
    </div>
  );
};

export default FileUpload; 