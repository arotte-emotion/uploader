import React, { useState, useEffect } from 'react';
import './DebugPanel.css';

interface DebugLog {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

interface SystemStatus {
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    memory: any;
    uptime: number;
  };
  contentful: {
    success: boolean;
    error?: string;
    space?: string;
    environment?: string;
  };
  filesystem: {
    tempImagesDir: boolean;
    uploadsDir: boolean;
    debugLogsFile: boolean;
  };
}

interface ContentfulTest {
  success: boolean;
  space?: string;
  environment?: string;
  contentTypes?: number;
  assets?: number;
  entries?: number;
  error?: string;
}

const DebugPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('status');
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [contentfulTest, setContentfulTest] = useState<ContentfulTest | null>(null);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSystemStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/debug/system-status');
      const data = await response.json();
      if (data.success) {
        setSystemStatus(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Fehler beim Abrufen des System-Status');
    } finally {
      setIsLoading(false);
    }
  };

  const testContentful = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/debug/contentful');
      const data = await response.json();
      if (data.success) {
        setContentfulTest(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Fehler beim Contentful-Test');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDebugLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/debug/logs');
      const data = await response.json();
      if (data.success) {
        setDebugLogs(data.data.logs);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Fehler beim Abrufen der Debug-Logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemStatus();
    fetchDebugLogs();
  }, []);

  const formatMemory = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return '#ff4444';
      case 'WARN': return '#ffaa00';
      case 'INFO': return '#4444ff';
      default: return '#666666';
    }
  };

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <h2>🔧 Debug-Panel</h2>
        <div className="debug-tabs">
          <button 
            className={activeTab === 'status' ? 'active' : ''}
            onClick={() => setActiveTab('status')}
          >
            📊 System-Status
          </button>
          <button 
            className={activeTab === 'contentful' ? 'active' : ''}
            onClick={() => setActiveTab('contentful')}
          >
            🔍 Contentful-Test
          </button>
          <button 
            className={activeTab === 'logs' ? 'active' : ''}
            onClick={() => setActiveTab('logs')}
          >
            📝 Debug-Logs
          </button>
        </div>
      </div>

      <div className="debug-content">
        {error && (
          <div className="debug-error">
            ❌ {error}
          </div>
        )}

        {activeTab === 'status' && (
          <div className="debug-section">
            <div className="section-header">
              <h3>System-Status</h3>
              <button onClick={fetchSystemStatus} disabled={isLoading}>
                {isLoading ? '🔄' : '🔄'}
              </button>
            </div>
            
            {systemStatus && (
              <div className="status-grid">
                <div className="status-card">
                  <h4>🌐 Umgebung</h4>
                  <p><strong>Node.js:</strong> {systemStatus.environment.nodeVersion}</p>
                  <p><strong>Platform:</strong> {systemStatus.environment.platform}</p>
                  <p><strong>Uptime:</strong> {formatUptime(systemStatus.environment.uptime)}</p>
                </div>

                <div className="status-card">
                  <h4>💾 Speicher</h4>
                  <p><strong>RSS:</strong> {formatMemory(systemStatus.environment.memory.rss)}</p>
                  <p><strong>Heap Used:</strong> {formatMemory(systemStatus.environment.memory.heapUsed)}</p>
                  <p><strong>Heap Total:</strong> {formatMemory(systemStatus.environment.memory.heapTotal)}</p>
                </div>

                <div className="status-card">
                  <h4>📁 Dateisystem</h4>
                  <p><strong>Temp Images:</strong> {systemStatus.filesystem.tempImagesDir ? '✅' : '❌'}</p>
                  <p><strong>Uploads:</strong> {systemStatus.filesystem.uploadsDir ? '✅' : '❌'}</p>
                  <p><strong>Debug Logs:</strong> {systemStatus.filesystem.debugLogsFile ? '✅' : '❌'}</p>
                </div>

                <div className="status-card">
                  <h4>🔗 Contentful</h4>
                  {systemStatus.contentful.success ? (
                    <>
                      <p><strong>Status:</strong> ✅ Verbunden</p>
                      <p><strong>Space:</strong> {systemStatus.contentful.space}</p>
                      <p><strong>Environment:</strong> {systemStatus.contentful.environment}</p>
                    </>
                  ) : (
                    <>
                      <p><strong>Status:</strong> ❌ Fehler</p>
                      <p><strong>Fehler:</strong> {systemStatus.contentful.error}</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'contentful' && (
          <div className="debug-section">
            <div className="section-header">
              <h3>Contentful-Verbindungstest</h3>
              <button onClick={testContentful} disabled={isLoading}>
                {isLoading ? '🔄' : '🔄'}
              </button>
            </div>
            
            {contentfulTest && (
              <div className="contentful-test">
                {contentfulTest.success ? (
                  <div className="test-success">
                    <h4>✅ Contentful-Verbindung erfolgreich</h4>
                    <div className="test-details">
                      <p><strong>Space:</strong> {contentfulTest.space}</p>
                      <p><strong>Environment:</strong> {contentfulTest.environment}</p>
                      <p><strong>Content-Types:</strong> {contentfulTest.contentTypes}</p>
                      <p><strong>Assets:</strong> {contentfulTest.assets}</p>
                      <p><strong>Entries:</strong> {contentfulTest.entries}</p>
                    </div>
                  </div>
                ) : (
                  <div className="test-error">
                    <h4>❌ Contentful-Verbindung fehlgeschlagen</h4>
                    <p><strong>Fehler:</strong> {contentfulTest.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="debug-section">
            <div className="section-header">
              <h3>Debug-Logs</h3>
              <button onClick={fetchDebugLogs} disabled={isLoading}>
                {isLoading ? '🔄' : '🔄'}
              </button>
            </div>
            
            <div className="logs-container">
              {debugLogs.length > 0 ? (
                debugLogs.map((log, index) => (
                  <div key={index} className="log-entry">
                    <div className="log-header">
                      <span className="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                      <span 
                        className="log-level"
                        style={{ color: getLevelColor(log.level) }}
                      >
                        {log.level}
                      </span>
                    </div>
                    <div className="log-message">{log.message}</div>
                    {log.data && (
                      <details className="log-data">
                        <summary>Daten anzeigen</summary>
                        <pre>{JSON.stringify(log.data, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                ))
              ) : (
                <p>Keine Debug-Logs verfügbar</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugPanel; 