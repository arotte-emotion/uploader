# Google Drive API Setup

## Voraussetzungen

1. **Google Cloud Console Projekt erstellen**
2. **Google Drive API aktivieren**
3. **Service Account erstellen**
4. **JSON-Schlüsseldatei herunterladen**

## Schritt-für-Schritt Anleitung

### 1. Google Cloud Console Projekt erstellen

1. Gehen Sie zu [Google Cloud Console](https://console.cloud.google.com/)
2. Klicken Sie auf "Projekt auswählen" → "Neues Projekt"
3. Geben Sie einen Projektnamen ein (z.B. "Briefing-Upload-API")
4. Klicken Sie auf "Erstellen"

### 2. Google Drive API aktivieren

1. Wählen Sie Ihr Projekt aus
2. Gehen Sie zu "APIs & Dienste" → "Bibliothek"
3. Suchen Sie nach "Google Drive API"
4. Klicken Sie auf "Google Drive API" → "Aktivieren"

### 3. Service Account erstellen

1. Gehen Sie zu "APIs & Dienste" → "Anmeldedaten"
2. Klicken Sie auf "+ ANMELDEDATEN ERSTELLEN" → "Service Account"
3. Geben Sie einen Namen ein (z.B. "briefing-upload-service")
4. Klicken Sie auf "Erstellen und Fortfahren"
5. Überspringen Sie die optionalen Schritte und klicken Sie auf "Fertig"

### 4. JSON-Schlüsseldatei herunterladen

1. Klicken Sie auf den erstellten Service Account
2. Gehen Sie zum Tab "Schlüssel"
3. Klicken Sie auf "Schlüssel hinzufügen" → "Neuen Schlüssel erstellen"
4. Wählen Sie "JSON" aus
5. Klicken Sie auf "Erstellen"
6. Die JSON-Datei wird automatisch heruntergeladen

### 5. Umgebungsvariablen konfigurieren

**Option A: Service Account Credentials (Empfohlen für private Dateien)**

**Methode 1: JSON-String in .env (Empfohlen)**
1. Öffnen Sie die heruntergeladene JSON-Datei
2. Kopieren Sie den gesamten Inhalt
3. Fügen Sie ihn in Ihre `.env` Datei ein:
   ```
   GOOGLE_APPLICATION_CREDENTIALS={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
   ```

**Methode 2: Dateipfad in .env**
1. Platzieren Sie die JSON-Datei im Projektordner
2. Fügen Sie den Dateipfad in Ihre `.env` Datei ein:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=./google-drive-credentials.json
   ```

**Option B: API Key (Für öffentliche Dateien)**

1. Gehen Sie zu "APIs & Dienste" → "Anmeldedaten"
2. Klicken Sie auf "+ ANMELDEDATEN ERSTELLEN" → "API-Schlüssel"
3. Kopieren Sie den API-Schlüssel
4. Fügen Sie ihn in Ihre `.env` Datei ein:
   ```
   GOOGLE_API_KEY=AIzaSyC...
   ```

### 6. Berechtigungen einrichten

**Für Service Account (Option A):**
1. Gehen Sie zurück zu Google Drive
2. Rechtsklick auf den Ordner mit den Bildern
3. "Freigeben" → "Erweitert"
4. Fügen Sie die Service Account E-Mail hinzu (aus der JSON-Datei)
5. Wählen Sie "Kann anzeigen"
6. Klicken Sie auf "Speichern"

**Für API Key (Option B):**
1. Stellen Sie sicher, dass die Dateien öffentlich zugänglich sind
2. Rechtsklick auf den Ordner → "Freigeben"
3. Wählen Sie "Jeder mit dem Link" → "Kann anzeigen"

## Verwendung

Nach dem Setup wird die Google Drive API automatisch beim Server-Start initialisiert. Die Anwendung versucht dann:

1. **Zuerst Google Drive API** (mit Authentifizierung)
2. **Fallback auf normale Download-Methoden** (falls API nicht verfügbar)

## Sicherheitshinweise

- **Nicht committen**: Die `google-drive-credentials.json` sollte nicht in Git eingecheckt werden
- **Umgebungsvariablen**: Für Produktion sollten die Credentials als Umgebungsvariablen gesetzt werden
- **Berechtigungen**: Der Service Account hat nur Leseberechtigungen

## Troubleshooting

### "Google API Credentials nicht gefunden"
- Stellen Sie sicher, dass die Umgebungsvariablen in der `.env` Datei korrekt gesetzt sind
- Überprüfen Sie die Variablennamen: `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_API_KEY`
- Stellen Sie sicher, dass die `.env` Datei im Projektordner liegt

### "Fehler beim Initialisieren der Google Drive API"
- Überprüfen Sie, ob die Google Drive API aktiviert ist
- Stellen Sie sicher, dass die Credentials gültig sind
- Überprüfen Sie die Internetverbindung
- Prüfen Sie die Berechtigungen in Google Drive

### "Datei ist kein Bild"
- Stellen Sie sicher, dass die Datei in Google Drive ein Bild ist
- Überprüfen Sie den MIME-Type der Datei

## Alternative Lösungen

Falls die Google Drive API nicht funktioniert:

1. **Direkte Bildlinks verwenden**
2. **Imgur für Bildhosting nutzen**
3. **GitHub für statische Bilder verwenden**
4. **Cloudinary für professionelles Bildhosting** 