require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const contentful = require('contentful-management');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const sharp = require('sharp');
// const Jimp = require('jimp'); // Fallback

// OpenAI API für Bildanalyse
const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();
const PORT = process.env.PORT || 3000;

// Cache für bereits analysierte Bilder
const imageAnalysisCache = new Map();
const CACHE_FILE = path.join(__dirname, 'image-analysis-cache.json');

// Lade Cache beim Start
function loadImageAnalysisCache() {
  try {
    console.log(`🔍 Prüfe Cache-Datei: ${CACHE_FILE}`);
    if (fs.existsSync(CACHE_FILE)) {
      const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      imageAnalysisCache.clear();
      for (const [key, value] of Object.entries(cacheData)) {
        imageAnalysisCache.set(key, value);
      }
      console.log(`📦 Bild-Analyse-Cache geladen: ${imageAnalysisCache.size} Einträge`);
      console.log(`📦 Cache-Keys:`, Array.from(imageAnalysisCache.keys()));
    } else {
      console.log(`📦 Cache-Datei existiert nicht - erstelle neue Datei`);
      // Erstelle leere Cache-Datei
      fs.writeFileSync(CACHE_FILE, JSON.stringify({}, null, 2));
      console.log(`📦 Neue Cache-Datei erstellt: ${CACHE_FILE}`);
    }
  } catch (error) {
    console.error('Fehler beim Laden des Bild-Analyse-Caches:', error.message);
    // Erstelle neue Cache-Datei bei Fehler
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify({}, null, 2));
      console.log(`📦 Cache-Datei nach Fehler neu erstellt: ${CACHE_FILE}`);
    } catch (writeError) {
      console.error('Fehler beim Erstellen der Cache-Datei:', writeError.message);
    }
  }
}

// Speichere Cache
function saveImageAnalysisCache() {
  try {
    const cacheData = {};
    for (const [key, value] of imageAnalysisCache.entries()) {
      cacheData[key] = value;
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log(`💾 Bild-Analyse-Cache gespeichert: ${imageAnalysisCache.size} Einträge`);
    console.log(`💾 Cache-Keys:`, Object.keys(cacheData));
  } catch (error) {
    console.error('Fehler beim Speichern des Bild-Analyse-Caches:', error.message);
  }
}

// Generiere Cache-Key für ein Bild
function generateImageCacheKey(imageUrl, filename) {
  return `${imageUrl}_${filename}`;
}

// Lade Cache beim Start
loadImageAnalysisCache();

// Erhöhte Timeouts für lange Bildverarbeitung
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Statische Dateien für Vercel
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
}
app.use('/temp_images', express.static(path.join(__dirname, 'temp_images')));

// Bildoptimierungsfunktion
async function optimizeImage(imageBuffer, maxWidth = 2000) {
  try {
    // Validiere Input Buffer
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new Error('Input ist kein gültiger Buffer');
    }
    
    if (imageBuffer.length === 0) {
      throw new Error('Input Buffer ist leer');
    }
    
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    console.log(`Bild-Metadaten: ${metadata.width}x${metadata.height}px, Format: ${metadata.format}`);
    
    // Prüfe, ob das Bild größer als maxWidth ist
    if (metadata.width > maxWidth) {
      console.log(`Bild wird von ${metadata.width}px auf ${maxWidth}px Breite optimiert`);
      const optimizedBuffer = await image
        .resize(maxWidth, null, { 
          withoutEnlargement: true,
          fit: 'inside'
        })
        .jpeg({ quality: 90 })
        .toBuffer();
      
      console.log(`Optimierter Buffer: ${optimizedBuffer.length} Bytes`);
      return optimizedBuffer;
    } else {
      console.log(`Bild behält Originalgröße: ${metadata.width}x${metadata.height}px`);
      const optimizedBuffer = await image
        .jpeg({ quality: 90 })
        .toBuffer();
      
      console.log(`Optimierter Buffer: ${optimizedBuffer.length} Bytes`);
      return optimizedBuffer;
    }
  } catch (error) {
    console.error('Fehler bei der Bildoptimierung:', error.message);
    console.error('Verwende Original-Buffer als Fallback');
    return imageBuffer; // Fallback: Original-Buffer zurückgeben
  }
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Deaktiviere CSP für Bildverarbeitung
}));
app.use(cors());
app.use(express.static(path.join(__dirname, 'client/build')));
app.use('/temp_images', express.static(path.join(__dirname, 'temp_images')));

// Rate Limiting - weniger restriktiv für Bildverarbeitung
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 50, // Reduziert von 100 auf 50 für stabilere Verarbeitung
  message: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.'
});
app.use('/api/', limiter);

// Spezielle Rate Limiting für Bildverarbeitung
const imageProcessingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 Minuten
  max: 10, // Maximal 10 Bildverarbeitungen pro 5 Minuten
  message: 'Zu viele Bildverarbeitungen. Bitte warten Sie einen Moment.'
});

// Multer Konfiguration für Datei-Uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.txt');
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Nur .txt Dateien sind erlaubt!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB Limit
  }
});

// Separate Multer-Konfiguration für Bilder (im Speicher, nicht auf Festplatte)
const imageUpload = multer({
  storage: multer.memoryStorage(), // Speichere Bilder im Speicher als Buffer
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Nur Bilddateien sind erlaubt!'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB Limit für Bilder
  }
});

// Contentful Client
const client = contentful.createClient({
  space: process.env.CONTENTFUL_SPACE_ID,
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
});

// Google Drive API Setup
let driveService = null;

async function initializeGoogleDriveAPI() {
  try {
    // Prüfe, ob Google API Credentials in Umgebungsvariablen vorhanden sind
    let applicationCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const apiKey = process.env.GOOGLE_API_KEY;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    
    // Fallback: Verwende lokale Credentials-Datei
    if (!applicationCredentials) {
      applicationCredentials = './etde-1681804329068-4adb9200ac4e.json';
      console.log('Verwende lokale Credentials-Datei als Fallback');
    }
    
    if (!applicationCredentials && !apiKey) {
      console.log('Google API Credentials nicht gefunden. Verwende Fallback-Methoden.');
      return false;
    }
    
    let auth;
    
    if (applicationCredentials) {
      // Verwende Service Account Credentials
      let credentials;
      
      // Prüfe, ob es ein Dateipfad oder JSON-String ist
      if (applicationCredentials.startsWith('{')) {
        // Direkter JSON-String
        credentials = JSON.parse(applicationCredentials);
      } else {
        // Dateipfad - versuche Datei zu lesen
        try {
          // Entferne Anführungszeichen falls vorhanden
          let credentialsPath = applicationCredentials.replace(/^["']|["']$/g, '');
          credentialsPath = path.resolve(credentialsPath);
          
          if (fs.existsSync(credentialsPath)) {
            credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
            console.log('Google Drive Credentials erfolgreich geladen von:', credentialsPath);
          } else {
            throw new Error(`Credentials-Datei nicht gefunden: ${credentialsPath}`);
          }
        } catch (fileError) {
          console.error('Fehler beim Lesen der Credentials-Datei:', fileError.message);
          return false;
        }
      }
      
      auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
      });
    } else if (apiKey) {
      // Verwende API Key für öffentliche Dateien
      auth = new google.auth.GoogleAuth({
        key: apiKey,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
      });
    }
    
    driveService = google.drive({ version: 'v3', auth });
    console.log('Google Drive API erfolgreich initialisiert');
    return true;
  } catch (error) {
    console.error('Fehler beim Initialisieren der Google Drive API:', error.message);
    return false;
  }
}

// Hilfsfunktionen für Briefing-Validierung
function extractSlug(briefingText) {
  const slugMatch = briefingText.match(/Slug:\s*([^\n]+)/);
  if (!slugMatch) return null;
  
  let slug = slugMatch[1].trim();
  
  // Entferne führende und abschließende Slashes
  slug = slug.replace(/^\/+|\/+$/g, '');
  
  return slug;
}

function extractMetaInfo(briefingText) {
  const metaTitleMatch = briefingText.match(/MT:\s*([^\n]+)/);
  const metaDescriptionMatch = briefingText.match(/MD:\s*([^\n]+)/);
  
  let metaTitle = metaTitleMatch ? metaTitleMatch[1].trim() : '';
  const metaDescription = metaDescriptionMatch ? metaDescriptionMatch[1].trim() : '';
  
  // Begrenze Meta-Title auf 60 Zeichen (Contentful-Limit)
  if (metaTitle.length > 60) {
    metaTitle = metaTitle.substring(0, 57) + '...';
  }
  
  return {
    metaTitle,
    metaDescription
  };
}

function validateBriefingFormat(briefingText) {
  const requiredFields = [
    { field: 'Slug:', name: 'Slug' },
    { field: 'MT:', name: 'Meta Title' },
    { field: 'MD:', name: 'Meta Description' }
  ];

  const missingFields = [];
  const errors = [];

  requiredFields.forEach(({ field, name }) => {
    if (!briefingText.includes(field)) {
      missingFields.push(name);
      errors.push(`${name} fehlt`);
    }
  });

  // [Produkt] oder [Produkte] Marker ist optional
  const hasProductMarker = briefingText.includes('[Produkt]') || briefingText.includes('[Produkte]');
  if (!hasProductMarker) {
    errors.push('[Produkt] oder [Produkte] Marker fehlt (optional)');
  }

  return {
    isValid: missingFields.length === 0,
    errors,
    missingFields,
    hasProductMarker
  };
}

// Hilfsfunktion zum Erkennen des Content-Typs basierend auf Text
function detectContentType(text, marker = '') {
  const lowerText = text.toLowerCase();
  const lowerMarker = marker.toLowerCase();
  
  // Prüfe spezielle Marker
  if (lowerMarker.includes('faq start') || lowerMarker.includes('faq ende')) {
    return 'faqBlock';
  }
  
  if (lowerMarker.includes('bild') || lowerMarker.includes('image') || lowerMarker.includes('galerie')) {
    return lowerMarker.includes('galerie') ? 'imageGallery' : 'image';
  }
  
  if (lowerMarker.includes('button') || lowerMarker.includes('link') || lowerMarker.includes('cta')) {
    return lowerMarker.includes('cta') ? 'callToAction' : 'textButtonLink';
  }
  
  if (lowerMarker.includes('liste') || lowerMarker.includes('list')) {
    return 'styledList';
  }
  
  if (lowerMarker.includes('produkt')) {
    return 'teaserElement';
  }
  
  if (lowerMarker.includes('hero')) {
    return 'heroElement';
  }
  
  if (lowerMarker.includes('teaser')) {
    return 'teaserElement';
  }
  
  // Standard: Rich Text
  return 'richText';
}

// Hilfsfunktion zum Segmentieren des Briefings
function segmentBriefing(briefingText) {
  const segments = [];
  const lines = briefingText.split('\n');
  
  let currentSegment = {
    type: 'richText',
    content: '',
    marker: ''
  };
  
  let isFAQBlock = false;
  
  for (const line of lines) {
    // Prüfe auf FAQ Start/Ende Marker
    if (line.includes('[FAQ Start]')) {
      // Vorheriges Segment speichern
      if (currentSegment.content.trim()) {
        segments.push({ ...currentSegment });
      }
      
      // FAQ Block starten
      isFAQBlock = true;
      currentSegment = {
        type: 'faqBlock',
        content: line + '\n',
        marker: 'FAQ Block'
      };
      continue;
    }
    
    if (line.includes('[FAQ Ende]')) {
      // FAQ Block beenden
      currentSegment.content += line + '\n';
      segments.push({ ...currentSegment });
      
      isFAQBlock = false;
      currentSegment = {
        type: 'richText',
        content: '',
        marker: ''
      };
      continue;
    }
    
    // Prüfe auf andere Marker
    const markerMatch = line.match(/\[([^\]]+)\]/);
    if (markerMatch && !isFAQBlock) {
      // Vorheriges Segment speichern
      if (currentSegment.content.trim()) {
        segments.push({ ...currentSegment });
      }
      
      // Neues Segment starten
      const marker = markerMatch[1];
      currentSegment = {
        type: detectContentType(line, marker),
        content: line + '\n',
        marker: marker
      };
      continue;
    }
    
    // Prüfe auf Button/Link Marker
    if (line.includes('[Button]')) {
      // Vorheriges Segment speichern
      if (currentSegment.content.trim()) {
        segments.push({ ...currentSegment });
      }
      
      // Button-Segment starten
      currentSegment = {
        type: 'textButtonLink',
        content: line + '\n',
        marker: 'Button'
      };
      continue;
    }
    
    // Prüfe auf Produkt/Teaser Marker
    if (line.includes('[Produkt]')) {
      // Vorheriges Segment speichern
      if (currentSegment.content.trim()) {
        segments.push({ ...currentSegment });
      }
      
      // Produkt-Segment starten
      currentSegment = {
        type: 'teaserElement',
        content: line + '\n',
        marker: 'Produkt'
      };
      continue;
    }
    
    // Prüfe auf Bildlink-Marker (ohne eckige Klammern)
    if (line.startsWith('Bildlink:')) {
      // Vorheriges Segment speichern
      if (currentSegment.content.trim()) {
        segments.push({ ...currentSegment });
      }
      
      // Bildlink-Segment starten
      currentSegment = {
        type: 'image',
        content: line + '\n',
        marker: 'Bildlink'
      };
      continue;
    }
    
    // Normaler Text
    currentSegment.content += line + '\n';
  }
  
  // Letztes Segment speichern
  if (currentSegment.content.trim()) {
    segments.push(currentSegment);
  }
  
  return segments;
}

// Hilfsfunktion zum Bereinigen des Contents (Metadaten entfernen)
function cleanContent(content) {
  const lines = content.split('\n');
  const cleanedLines = [];
  let foundFirstHeading = false;
  
  for (const line of lines) {
    // Überspringe Metadaten
    if (line.startsWith('Slug:') || line.startsWith('Meta Title:') || line.startsWith('Meta Description:')) {
      continue;
    }
    
    // Wenn wir die erste Überschrift finden, markieren wir es
    if (line.startsWith('H1:') || line.startsWith('H2:') || line.startsWith('H3:')) {
      foundFirstHeading = true;
    }
    
    // Nur Zeilen nach der ersten Überschrift oder wenn es keine Überschriften gibt
    if (foundFirstHeading || (!foundFirstHeading && line.trim() !== '')) {
      cleanedLines.push(line);
    }
  }
  
  return cleanedLines.join('\n');
}

// Verbesserte Content-Type-Analyse basierend auf briefing-importer.js
function analyzeContentTypes(briefingText) {
  console.log(`\n=== Briefing Analyse (basierend auf briefing-importer.js) ===`);
  
  // Extrahiere Page-Daten (basierend auf briefing-importer.js)
  const pageData = extractPageData(briefingText);
  console.log(`Slug: ${pageData.slug}`);
  console.log(`Internal Name: ${pageData.internalName}`);
  console.log(`Meta Title: ${pageData.metaTitle}`);
  console.log(`Meta Description: ${pageData.metaDescription}`);
  
  // Extrahiere Content-Segmente (basierend auf briefing-importer.js)
  const extractedContent = extractContent(briefingText);
  const contentTypes = [];
  
  // Analysiere Intro-Content (vor [Produkt])
  if (extractedContent.beforeProduct.trim()) {
    contentTypes.push('Rich Text (Intro)');
    console.log(`✅ Intro-Content gefunden: ${extractedContent.beforeProduct.length} Zeichen`);
  }
  
  // Analysiere Haupt-Content (nach [Produkt])
  if (extractedContent.afterProduct.trim()) {
    contentTypes.push('Rich Text (Hauptinhalt)');
    console.log(`✅ Haupt-Content gefunden: ${extractedContent.afterProduct.length} Zeichen`);
  }
  
  // Analysiere FAQs (basierend auf briefing-importer.js)
  const faqs = extractFAQs(briefingText);
  if (faqs.length > 0) {
    contentTypes.push('FAQ Accordion');
    console.log(`✅ FAQs gefunden: ${faqs.length} Fragen`);
    
    // Zeige FAQ-Details
    faqs.forEach((faq, index) => {
      console.log(`  FAQ ${index + 1}: "${faq.question}" (${faq.answer.length} Zeichen)`);
    });
  }
  
  // Analysiere Rich-Text-Struktur (basierend auf briefing-importer.js)
  const richTextContent = parseContentToRichText(briefingText);
  const headingCount = richTextContent.filter(node => node.nodeType.startsWith('heading-')).length;
  const paragraphCount = richTextContent.filter(node => node.nodeType === 'paragraph').length;
  
  console.log(`\nRich-Text-Struktur:`);
  console.log(`- Überschriften: ${headingCount}`);
  console.log(`- Absätze: ${paragraphCount}`);
  console.log(`- Gesamt-Nodes: ${richTextContent.length}`);
  
  console.log(`\nZusammenfassung:`);
  console.log(`- Gefundene Content-Types: ${contentTypes.join(', ')}`);
  console.log(`- Page: ${pageData.internalName}`);
  console.log(`- FAQs: ${faqs.length}`);
  console.log('=== Ende Analyse ===\n');
  
  return {
    contentTypes,
    pageData,
    faqs,
    richTextStructure: {
      headings: headingCount,
      paragraphs: paragraphCount,
      totalNodes: richTextContent.length
    }
  };
}

// Neue Funktionen für Bildverarbeitung
async function extractImageLinks(briefingText) {
  const imageLinks = [];
  const lines = briefingText.split('\n');
  
  console.log('\n=== Bildlink-Suche ===');
  console.log(`Durchsuche ${lines.length} Zeilen...`);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Debug: Zeige alle Zeilen, die "Bild" enthalten
    if (line.toLowerCase().includes('bild')) {
      console.log(`Zeile ${i + 1}: "${line}"`);
    }
    
    if (line.startsWith('Bildlink:')) {
      console.log(`✅ Bildlink gefunden in Zeile ${i + 1}: "${line}"`);
      const content = line.replace('Bildlink:', '').trim();
      if (content) {
        // Copyright-Hinweis aus Klammern extrahieren
        const copyrightMatch = content.match(/\((.*?)\)/);
        const copyright = copyrightMatch ? copyrightMatch[1].trim() : null;
        
        // URL ohne Copyright-Hinweis extrahieren
        const urlWithoutCopyright = content.replace(/\(.*?\)/g, '').trim();
        
        // Konvertiere Google Drive View-Links zu Download-Links
        const downloadUrl = convertGoogleDriveLink(urlWithoutCopyright);
        
        imageLinks.push({
          lineNumber: i + 1,
          url: downloadUrl,
          originalUrl: urlWithoutCopyright,
          originalLine: line,
          isConverted: downloadUrl !== urlWithoutCopyright,
          copyright: copyright
        });
        
        console.log(`  → URL: ${urlWithoutCopyright}`);
        console.log(`  → Download URL: ${downloadUrl}`);
        if (copyright) {
          console.log(`  → Copyright: ${copyright}`);
        }
      }
    }
  }
  
  console.log(`Gefundene Bildlinks: ${imageLinks.length}`);
  console.log('=== Ende Bildlink-Suche ===\n');
  
  return imageLinks;
}

function extractLocalInfo(briefingText) {
  const localInfo = [];
  const lines = briefingText.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Suche nach lokalen Informationen (Adressen, Kontaktdaten, etc.)
    if (line.includes('Adresse:') || 
        line.includes('Kontakt:') || 
        line.includes('Telefon:') || 
        line.includes('Email:') || 
        line.includes('Öffnungszeiten:') ||
        line.includes('Anfahrt:') ||
        line.includes('Standort:') ||
        line.includes('Geschäft:') ||
        line.includes('Filiale:')) {
      
      const infoType = line.split(':')[0].trim();
      const infoValue = line.split(':').slice(1).join(':').trim();
      
      if (infoValue) {
        localInfo.push({
          type: infoType,
          value: infoValue,
          lineNumber: i + 1
        });
      }
    }
  }
  
  return localInfo;
}

// Timeout-Konfiguration für Bildverarbeitung
const IMAGE_PROCESSING_TIMEOUT = 30000; // 30 Sekunden pro Bild
const OPENAI_TIMEOUT = 15000; // 15 Sekunden für KI-Analyse
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB maximale Bildgröße

// Hilfsfunktion zur Bildformat-Erkennung
function detectImageFormat(imageBuffer) {
  const header = imageBuffer.slice(0, 12);
  
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47 &&
      header[4] === 0x0D && header[5] === 0x0A && header[6] === 0x1A && header[7] === 0x0A) {
    return { format: 'png', mimeType: 'image/png' };
  }
  
  // GIF: 47 49 46 38 (GIF8)
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
    return { format: 'gif', mimeType: 'image/gif' };
  }
  
  // WebP: RIFF....WEBP
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
      header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) {
    return { format: 'webp', mimeType: 'image/webp' };
  }
  
  // JPEG: FF D8 FF
  if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
    return { format: 'jpeg', mimeType: 'image/jpeg' };
  }
  
  // Unbekanntes Format - verwende JPEG als Fallback
  return { format: 'jpeg', mimeType: 'image/jpeg' };
}

async function downloadImage(imageUrl) {
  try {
    console.log(`Lade Bild herunter: ${imageUrl}`);
    
    // Prüfe Google Drive Links und verwende API falls verfügbar
    const googleDriveMatch = imageUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (googleDriveMatch && driveService) {
      const fileId = googleDriveMatch[1];
      console.log(`Google Drive Link erkannt, verwende API für File ID: ${fileId}`);
      
      try {
        const apiResult = await downloadGoogleDriveFileWithAuth(fileId);
        console.log(`Google Drive API erfolgreich: ${apiResult.filename} (${apiResult.buffer.length} bytes)`);
        return apiResult;
      } catch (apiError) {
        console.log(`Google Drive API fehlgeschlagen: ${apiError.message}`);
        console.log('Versuche Fallback-Methoden...');
      }
    }
    
    // Fallback: Normale Download-Methoden
    // Timeout für Download hinzufügen
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_PROCESSING_TIMEOUT);
    
    // Verbesserte Headers für Google Drive
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/jpeg,image/png,image/gif,image/webp,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Referer': 'https://drive.google.com/',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'same-origin'
    };
    
    const response = await fetch(imageUrl, {
      headers: headers,
      signal: controller.signal,
      redirect: 'follow'
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // Prüfe, ob wir tatsächlich ein Bild erhalten haben oder eine HTML-Seite
    const isHtmlResponse = contentType.includes('text/html') || contentType.includes('text/plain');
    
    if (isHtmlResponse) {
      console.log(`Warnung: HTML-Antwort erhalten statt Bild. Content-Type: ${contentType}`);
      console.log('Versuche alternative Google Drive Download-Methoden...');
      
      // Versuche alternative Google Drive Download-URLs
      const fileIdMatch = imageUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (fileIdMatch) {
        const fileId = fileIdMatch[1];
        const alternativeUrls = [
          `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
          `https://drive.google.com/uc?export=download&id=${fileId}`,
          `https://docs.google.com/uc?export=download&id=${fileId}`,
          `https://drive.google.com/file/d/${fileId}/preview`
        ];
        
        for (const altUrl of alternativeUrls) {
          try {
            console.log(`Versuche alternative URL: ${altUrl}`);
            
            const altController = new AbortController();
            const altTimeoutId = setTimeout(() => altController.abort(), IMAGE_PROCESSING_TIMEOUT);
            
            const altResponse = await fetch(altUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/jpeg,image/png,image/gif,image/webp,*/*',
                'Referer': 'https://drive.google.com/',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'same-origin'
              },
              signal: altController.signal,
              redirect: 'follow'
            });
            
            clearTimeout(altTimeoutId);
            
            if (altResponse.ok) {
              const altBuffer = await altResponse.arrayBuffer();
              const altContentType = altResponse.headers.get('content-type') || 'image/jpeg';
              
              // Prüfe, ob die alternative Antwort tatsächlich ein Bild ist
              if (!altContentType.includes('text/html') && !altContentType.includes('text/plain')) {
                console.log(`Alternative URL erfolgreich: ${altContentType}`);
                
                // Prüfe Bildgröße
                if (altBuffer.byteLength > MAX_IMAGE_SIZE) {
                  throw new Error(`Bild ist zu groß: ${(altBuffer.byteLength / 1024 / 1024).toFixed(1)}MB (Maximum: ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`);
                }
                
                const filename = `google-drive-${fileId}.jpg`;
                console.log(`Bild erfolgreich heruntergeladen: ${filename} (${altBuffer.byteLength} bytes)`);
                
                return {
                  buffer: Buffer.from(altBuffer),
                  contentType: altContentType,
                  filename: filename,
                  isValidImage: true,
                  isSupportedFormat: true
                };
              }
            }
          } catch (altError) {
            console.log(`Alternative URL fehlgeschlagen: ${altUrl} - ${altError.message}`);
            continue;
          }
        }
      }
      
      // Wenn alle alternativen URLs fehlschlagen, erstelle einen Fallback
      console.log('Alle Google Drive Download-Versuche fehlgeschlagen. Erstelle Fallback...');
      throw new Error('Google Drive Download nicht möglich - alle Methoden fehlgeschlagen');
    }
    
    // Prüfe Bildgröße
    if (buffer.byteLength > MAX_IMAGE_SIZE) {
      throw new Error(`Bild ist zu groß: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB (Maximum: ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`);
    }
    
    // Extrahiere Dateiname aus URL oder verwende Standard
    const urlParts = imageUrl.split('/');
    let filename = urlParts[urlParts.length - 1] || 'image.jpg';
    
    // Bereinige den Dateinamen
    filename = filename.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 100);
    if (!filename.includes('.')) {
      filename += '.jpg';
    }
    
    console.log(`Bild erfolgreich heruntergeladen: ${filename} (${buffer.byteLength} bytes)`);
    
    // Prüfe, ob es sich um ein gültiges Bild handelt
    const isValidImage = contentType.startsWith('image/') || 
                        filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    
    if (!isValidImage) {
      console.log(`Warnung: Content-Type ${contentType} wird möglicherweise nicht von Contentful unterstützt`);
    }
    
    // Prüfe auf gültige Bildformate für Contentful
    const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const isSupportedFormat = supportedFormats.includes(contentType.toLowerCase());
    
    if (!isSupportedFormat) {
      console.log(`Warnung: Content-Type ${contentType} wird möglicherweise nicht von Contentful unterstützt`);
    }
    
    return {
      buffer: Buffer.from(buffer),
      contentType: contentType,
      filename: filename,
      isValidImage: isValidImage,
      isSupportedFormat: isSupportedFormat
    };
  } catch (error) {
    console.error(`Fehler beim Herunterladen des Bildes: ${error.message}`);
    throw error;
  }
}

async function analyzeImageWithAI(localImagePath, isValidImage = true, imageUrl = null) {
  try {
    // Wenn das Bild nicht gültig ist, verwende eine Standard-Beschreibung
    if (!isValidImage) {
      console.log('Bild ist nicht gültig - verwende Standard-Beschreibung');
      return {
        title: 'E-Bike Komponente',
        description: 'E-Bike oder Fahrrad-bezogene Komponente für die Website.'
      };
    }
    
    // Lese das lokale Bild oder verwende den bereits vorhandenen Buffer
    let imageBuffer;
    let filename = 'unbekannt';
    
    if (Buffer.isBuffer(localImagePath)) {
      imageBuffer = localImagePath;
    } else if (localImagePath && typeof localImagePath === 'object' && localImagePath.buffer) {
      imageBuffer = localImagePath.buffer;
      filename = localImagePath.filename || 'unbekannt';
    } else {
      imageBuffer = await readLocalImageForOpenAI(localImagePath);
      filename = localImagePath.filename || path.basename(localImagePath) || 'unbekannt';
    }
    
    // Prüfe Cache für bereits analysierte Bilder
    if (imageUrl) {
      const cacheKey = generateImageCacheKey(imageUrl, filename);
      console.log(`🔍 Prüfe Cache für Key: ${cacheKey}`);
      console.log(`🔍 Cache-Größe: ${imageAnalysisCache.size} Einträge`);
      console.log(`🔍 Verfügbare Cache-Keys:`, Array.from(imageAnalysisCache.keys()));
      
      const cachedAnalysis = imageAnalysisCache.get(cacheKey);
      
      if (cachedAnalysis) {
        console.log(`📦 Cache-Hit für Bild: ${filename}`);
        console.log(`📦 Verwende gecachte Analyse: "${cachedAnalysis.title}"`);
        return cachedAnalysis;
      }
      
      console.log(`🔍 Cache-Miss für Bild: ${filename} - führe neue Analyse durch`);
    } else {
      console.log(`⚠️  Keine imageUrl bereitgestellt - Cache wird nicht verwendet`);
    }
    
    // Prüfe Bildgröße für OpenAI (max 20MB für GPT-4o-mini)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (imageBuffer.length > maxSize) {
      console.log('Bild ist zu groß für KI-Analyse - verwende Standard-Beschreibung');
      return {
        title: 'E-Bike Komponente',
        description: 'E-Bike oder Fahrrad-bezogene Komponente für die Website.'
      };
    }
    
    // Retry-Logik für OpenAI API
    const maxRetries = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`KI-Analyse Versuch ${attempt}/${maxRetries}...`);
        
        // Timeout für OpenAI API hinzufügen
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT);
        
        // Bestimme das korrekte Bildformat aus der lokalen Datei
        const { format: imageFormat, mimeType } = detectImageFormat(imageBuffer);
        
        console.log(`Erkanntes Bildformat: ${imageFormat} (${mimeType})`);
        
        // Prüfe, ob das erkannte Format von OpenAI unterstützt wird
        const supportedFormats = ['jpeg', 'png', 'gif', 'webp'];
        if (!supportedFormats.includes(imageFormat)) {
          console.log(`Warnung: Bildformat ${imageFormat} wird möglicherweise nicht von OpenAI unterstützt. Verwende JPEG als Fallback.`);
          imageFormat = 'jpeg';
          mimeType = 'image/jpeg';
        }
        
        // Zusätzliche Validierung: Prüfe, ob das Bild tatsächlich gültig ist
        if (imageBuffer.length < 100) {
          console.log('Bild ist zu klein - möglicherweise kein gültiges Bild');
          return {
            title: 'E-Bike Komponente',
            description: 'E-Bike oder Fahrrad-bezogene Komponente für die Website.'
          };
        }
        
        // Prüfe, ob das Bild tatsächlich ein gültiges Bildformat hat
        const header = imageBuffer.slice(0, 12);
        const isJpeg = header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF;
        const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
        const isGif = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
        const isWebP = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
                      header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
        
        if (!isJpeg && !isPng && !isGif && !isWebP) {
          console.log('Bild hat kein gültiges Format - möglicherweise HTML oder andere Datei');
          return {
            title: 'E-Bike Komponente',
            description: 'E-Bike oder Fahrrad-bezogene Komponente für die Website.'
          };
        }
        
        // Extrahiere Dateiname für zusätzliche Informationen
        const filenameInfo = filename.replace(/[_-]/g, ' ').replace(/\.(jpg|jpeg|png|gif|webp)$/i, '').trim();
        
        console.log(`Dateiname für KI-Analyse: "${filenameInfo}"`);
        
        // Verbesserte Prompt für bessere Ergebnisse
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "Du bist ein Experte für E-Bike und Fahrrad-Fotografie. Analysiere das Bild und erstelle präzise Beschreibungen. Berücksichtige dabei auch Informationen aus dem Dateinamen. Erstelle reine, sachliche Beschreibungen ohne Einleitung wie 'Das Bild zeigt'."
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analysiere dieses Bild und erstelle zwei Beschreibungen in Deutsch:\n\nDateiname: "${filenameInfo}"\n\n1. Einen kurzen Titel (maximal 256 Zeichen) - fokussiere auf das Hauptmotiv und berücksichtige den Dateinamen\n2. Eine detaillierte Beschreibung (maximal 750 Zeichen) - beschreibe das Bild sachlich und integriere relevante Informationen aus dem Dateinamen\n\nFokussiere dich auf E-Bikes, Fahrräder, Komponenten oder Zubehör.\n\nAntworte im Format:\nTITLE: [kurzer Titel]\nDESCRIPTION: [detaillierte Beschreibung]`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`,
                    detail: "low" // Reduziere Detail-Level für bessere Performance
                  }
                }
              ]
            }
          ],
          max_tokens: 300,
          temperature: 0.7
        });
        
        clearTimeout(timeoutId);
        
        const content = response.choices[0].message.content;
        console.log(`KI-Antwort: ${content}`);
        
        // Parse die Antwort
        const titleMatch = content.match(/TITLE:\s*(.+?)(?:\n|$)/i);
        const descriptionMatch = content.match(/DESCRIPTION:\s*(.+?)(?:\n|$)/i);
        
        const title = titleMatch ? titleMatch[1].trim().substring(0, 256) : 'E-Bike Komponente';
        const description = descriptionMatch ? descriptionMatch[1].trim().substring(0, 750) : 'E-Bike oder Fahrrad-bezogene Komponente für die Website.';
        
        console.log(`Parsed Title: "${title}"`);
        console.log(`Parsed Description: "${description}"`);
        
        console.log(`KI-Analyse erfolgreich nach ${attempt} Versuchen`);
        
        // Speichere Analyse im Cache
        if (imageUrl) {
          const cacheKey = generateImageCacheKey(imageUrl, filename);
          const analysisResult = { title, description };
          imageAnalysisCache.set(cacheKey, analysisResult);
          console.log(`💾 Analyse für ${filename} im Cache gespeichert`);
          console.log(`💾 Cache-Key: ${cacheKey}`);
          console.log(`💾 Cache-Größe nach Speicherung: ${imageAnalysisCache.size}`);
          // Speichere Cache sofort in Datei
          saveImageAnalysisCache();
        }
        
        return { title, description };
        
      } catch (error) {
        lastError = error;
        console.error(`KI-Analyse Versuch ${attempt} fehlgeschlagen:`, error.message);
        
        // Spezifische Behandlung für 400er Fehler und Format-Probleme
        if (error.message && (error.message.includes('400') || error.message.includes('unsupported image') || error.message.includes('invalid_image_format'))) {
          console.log('400er Fehler oder Bildformat-Problem erkannt - versuche alternative Methode...');
          
          // Versuche mit reduziertem Detail-Level
          try {
            // Bestimme das korrekte Bildformat auch für alternative Methode
            const { format: imageFormat, mimeType } = detectImageFormat(imageBuffer);
            
            console.log(`Alternative Methode - erkanntes Bildformat: ${imageFormat} (${mimeType})`);
            
            // Prüfe, ob das erkannte Format von OpenAI unterstützt wird (auch für alternative Methode)
            const supportedFormats = ['jpeg', 'png', 'gif', 'webp'];
            if (!supportedFormats.includes(imageFormat)) {
              console.log(`Warnung: Bildformat ${imageFormat} wird möglicherweise nicht von OpenAI unterstützt. Verwende JPEG als Fallback.`);
              imageFormat = 'jpeg';
              mimeType = 'image/jpeg';
            }
            
            const altResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Analysiere dieses Bild und erstelle zwei Beschreibungen in Deutsch:\n\nDateiname: "${filenameInfo}"\n\n1. Einen kurzen Titel (maximal 256 Zeichen) - berücksichtige den Dateinamen\n2. Eine detaillierte Beschreibung (maximal 750 Zeichen) - integriere relevante Informationen aus dem Dateinamen\n\nAntworte im Format:\nTITLE: [kurzer Titel]\nDESCRIPTION: [detaillierte Beschreibung]`
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`,
                        detail: "low"
                      }
                    }
                  ]
                }
              ],
              max_tokens: 150,
              temperature: 0.5
            });
            
            const altContent = altResponse.choices[0].message.content;
            const altTitleMatch = altContent.match(/TITLE:\s*(.+?)(?:\n|$)/i);
            const altDescriptionMatch = altContent.match(/DESCRIPTION:\s*(.+?)(?:\n|$)/i);
            
            const altTitle = altTitleMatch ? altTitleMatch[1].trim().substring(0, 256) : 'E-Bike Komponente';
            const altDescription = altDescriptionMatch ? altDescriptionMatch[1].trim().substring(0, 750) : 'E-Bike oder Fahrrad-bezogene Komponente für die Website.';
            
            console.log('Alternative KI-Analyse erfolgreich');
            
            // Speichere Analyse im Cache
            if (imageUrl) {
              const cacheKey = generateImageCacheKey(imageUrl, filename);
              const analysisResult = { title: altTitle, description: altDescription };
              imageAnalysisCache.set(cacheKey, analysisResult);
              console.log(`💾 Alternative Analyse für ${filename} im Cache gespeichert`);
              // Speichere Cache sofort in Datei
              saveImageAnalysisCache();
            }
            
            return { title: altTitle, description: altDescription };
            
          } catch (altError) {
            console.error('Auch alternative KI-Analyse fehlgeschlagen:', altError.message);
            
            // Versuche als letzte Option, das Bild als JPEG zu behandeln
            try {
              console.log('Versuche letzte Fallback-Methode mit JPEG-Format...');
              
              const fallbackResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: `Analysiere dieses Bild und erstelle zwei Beschreibungen in Deutsch:\n\nDateiname: "${filenameInfo}"\n\n1. Einen kurzen Titel (maximal 256 Zeichen) - berücksichtige den Dateinamen\n2. Eine detaillierte Beschreibung (maximal 750 Zeichen) - integriere relevante Informationen aus dem Dateinamen\n\nAntworte im Format:\nTITLE: [kurzer Titel]\nDESCRIPTION: [detaillierte Beschreibung]`
                      },
                      {
                        type: "image_url",
                        image_url: {
                          url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
                          detail: "low"
                        }
                      }
                    ]
                  }
                ],
                max_tokens: 100,
                temperature: 0.3
              });
              
              const fallbackContent = fallbackResponse.choices[0].message.content;
              const fallbackTitleMatch = fallbackContent.match(/TITLE:\s*(.+?)(?:\n|$)/i);
              const fallbackDescriptionMatch = fallbackContent.match(/DESCRIPTION:\s*(.+?)(?:\n|$)/i);
              
              const fallbackTitle = fallbackTitleMatch ? fallbackTitleMatch[1].trim().substring(0, 256) : 'E-Bike Produktbild';
              const fallbackDescription = fallbackDescriptionMatch ? fallbackDescriptionMatch[1].trim().substring(0, 750) : 'E-Bike oder Fahrrad-bezogenes Produktbild für die Website.';
              
              console.log('Fallback-Methode erfolgreich');
              
              // Speichere Analyse im Cache
              if (imageUrl) {
                const cacheKey = generateImageCacheKey(imageUrl, filename);
                const analysisResult = { title: fallbackTitle, description: fallbackDescription };
                imageAnalysisCache.set(cacheKey, analysisResult);
                console.log(`💾 Fallback-Analyse für ${filename} im Cache gespeichert`);
                // Speichere Cache sofort in Datei
                saveImageAnalysisCache();
              }
              
              return { title: fallbackTitle, description: fallbackDescription };
            } catch (fallbackError) {
              console.error('Auch Fallback-Methode fehlgeschlagen:', fallbackError.message);
            }
          }
        }
        
        if (attempt < maxRetries) {
          // Warte vor dem nächsten Versuch (exponentieller Backoff)
          const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`Warte ${waitTime}ms vor nächstem Versuch...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // Alle Versuche fehlgeschlagen
    console.error('Alle KI-Analyse Versuche fehlgeschlagen, verwende Fallback');
    throw lastError;
    
  } catch (error) {
    console.error('Fehler bei der KI-Bildanalyse:', error);
    
    // Fallback-Beschreibung bei Fehlern
    return {
      title: 'E-Bike Produktbild',
      description: 'E-Bike oder Fahrrad-bezogenes Produktbild für die Website.'
    };
  }
}

async function uploadImageToContentful(environment, imageBuffer, filename, contentType, aiAnalysis = null) {
  try {
    console.log(`Lade Bild zu Contentful hoch: ${filename}`);
    
    // Verwende KI-Analyse oder Fallback
    let title, description;
    
    if (aiAnalysis && aiAnalysis.title && aiAnalysis.description) {
      title = aiAnalysis.title.substring(0, 256);
      description = aiAnalysis.description.substring(0, 750);
    } else {
      // Fallback: Erstelle einen kurzen Titel (max 256 Zeichen)
      title = filename.replace(/\.[^/.]+$/, "").substring(0, 256);
      // Fallback: Erstelle eine Standard-Beschreibung (max 750 Zeichen)
      description = `E-Bike oder Fahrrad-bezogenes Produktbild - ${title}`.substring(0, 750);
    }
    
    // Prüfe und bereinige den Dateinamen
    const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 100);
    
    // Stelle sicher, dass die Dateiendung korrekt ist
    let finalFilename = cleanFilename;
    if (!finalFilename.toLowerCase().endsWith('.jpg') && !finalFilename.toLowerCase().endsWith('.jpeg')) {
      finalFilename = finalFilename.replace(/\.[^/.]+$/, '') + '.jpg';
    }
    
    // Prüfe Content-Type und konvertiere bei Bedarf
    let finalContentType = contentType;
    if (!contentType.startsWith('image/')) {
      finalContentType = 'image/jpeg';
    }
    
    // Prüfe Bildgröße für Contentful (max 20MB)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (imageBuffer.length > maxSize) {
      throw new Error(`Bild ist zu groß für Contentful: ${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB (Maximum: 20MB)`);
    }
    
    console.log(`Bild-Details: ${finalFilename}, Größe: ${(imageBuffer.length / 1024).toFixed(1)}KB, Type: ${finalContentType}`);
    console.log(`Buffer-Typ: ${typeof imageBuffer}, ist Buffer: ${Buffer.isBuffer(imageBuffer)}`);
    
    // Prüfe zuerst, ob bereits ein Asset mit diesem Dateinamen existiert
    console.log('Prüfe auf bestehende Assets...');
    try {
      const existingAssets = await environment.getAssets({
        'fields.file.fileName': finalFilename,
        limit: 1
      });
      
      if (existingAssets.items.length > 0) {
        const existingAsset = existingAssets.items[0];
        console.log(`✅ Bestehendes Asset gefunden: ${existingAsset.sys.id} für ${finalFilename}`);
        console.log(`📋 Asset Status: ${existingAsset.sys.publishedVersion ? 'Published' : 'Draft'}`);
        
        // Wenn das Asset bereits publiziert ist, verwende es
        if (existingAsset.sys.publishedVersion) {
          console.log(`✅ Verwende bereits publiziertes Asset: ${existingAsset.sys.id}`);
          return existingAsset;
        } else {
          // Versuche das bestehende Asset zu publishen
          try {
            await existingAsset.publish();
            console.log(`✅ Bestehendes Asset erfolgreich publiziert: ${existingAsset.sys.id}`);
            return existingAsset;
          } catch (publishError) {
            console.log(`⚠️  Bestehendes Asset kann nicht publiziert werden: ${existingAsset.sys.id}`);
            console.log(`📋 Publish-Fehler: ${publishError.message}`);
            // Verwende das Asset trotzdem
            return existingAsset;
          }
        }
      }
    } catch (error) {
      console.log(`⚠️  Fehler beim Prüfen auf bestehende Assets: ${error.message}`);
      // Fahre mit dem Upload fort
    }
    
    // Schritt 1: Binary File Upload zu Contentful Upload API
    console.log('Schritt 1: Lade Binärdatei zu Contentful Upload API hoch...');
    const uploadResponse = await fetch(`https://upload.contentful.com/spaces/${process.env.CONTENTFUL_SPACE_ID}/uploads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CONTENTFUL_MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/octet-stream'
      },
      body: imageBuffer
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload API Fehler: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
    }
    
    const uploadData = await uploadResponse.json();
    console.log(`Upload erfolgreich: Upload ID ${uploadData.sys.id}`);
    
    // Schritt 2: Asset-Erstellung mit Referenz auf Upload
    console.log('Schritt 2: Erstelle Asset mit Upload-Referenz...');
    const asset = await environment.createAsset({
      fields: {
        title: {
          'de-DE': title
        },
        description: {
          'de-DE': description
        },
        file: {
          'de-DE': {
            uploadFrom: {
              sys: {
                type: 'Link',
                linkType: 'Upload',
                id: uploadData.sys.id
              }
            },
            contentType: finalContentType,
            fileName: finalFilename
          }
        }
      }
    });
    
    console.log(`Asset erstellt: ${asset.sys.id}, verarbeite...`);
    
    // Verarbeite das Asset
    await asset.processForAllLocales();
    
    console.log(`Asset verarbeitet, veröffentliche...`);
    
    // Veröffentliche das Asset mit robuster Version-Handling
    try {
      await asset.publish();
      console.log(`Asset erfolgreich veröffentlicht: ${asset.sys.id}`);
      return asset;
    } catch (publishError) {
      if (publishError.message && publishError.message.includes('VersionMismatch') || 
          (publishError.status === 409 && publishError.statusText === 'Conflict')) {
        console.log(`Version-Konflikt beim Asset ${asset.sys.id}, hole aktuelle Version...`);
        
        try {
          // Hole das Asset erneut mit aktueller Version
          const freshAsset = await environment.getAsset(asset.sys.id);
          console.log(`Aktuelle Asset-Version geholt: ${freshAsset.sys.version}`);
          
          // Versuche erneut zu publishen
          await freshAsset.publish();
          console.log(`Asset erfolgreich veröffentlicht mit aktueller Version: ${asset.sys.id}`);
          return freshAsset;
        } catch (retryError) {
          console.log(`Erneuter Publish-Versuch fehlgeschlagen, verwende Asset ohne Veröffentlichung: ${asset.sys.id}`);
          console.log(`Asset verfügbar (nicht veröffentlicht): ${asset.sys.id}`);
          return asset;
        }
      } else {
        console.error('Unbekannter Publish-Fehler:', publishError.message);
        throw publishError;
      }
    }
  } catch (error) {
    console.error('Fehler beim Hochladen des Bildes zu Contentful:', error);
    
    // Detaillierte Fehleranalyse
    if (error.message && error.message.includes('400')) {
      console.error('Contentful 400 Fehler - mögliche Ursachen:');
      console.error('- Ungültiger Content-Type');
      console.error('- Zu große Bilddatei');
      console.error('- Ungültiger Upload-Format');
      console.error('- Fehlende Berechtigungen');
    } else if (error.message && error.message.includes('422')) {
      console.error('Contentful 422 Fehler - mögliche Ursachen:');
      console.error('- Ungültiges Bildformat');
      console.error('- Beschädigte Bilddatei');
      console.error('- Nicht unterstützter Dateityp');
      console.error('- Fehlerhafte Bilddaten');
      console.error(`- Dateiname: ${typeof finalFilename !== 'undefined' ? finalFilename : filename || 'unknown'}`);
      console.error(`- Content-Type: ${typeof finalContentType !== 'undefined' ? finalContentType : contentType || 'unknown'}`);
      console.error(`- Bildgröße: ${imageBuffer ? (imageBuffer.length / 1024).toFixed(1) + 'KB' : 'unknown'}`);
    }
    
    throw error;
  }
}

async function createImageEntry(environment, asset, description, internalName, copyright = null) {
  try {
    console.log(`Erstelle Image-Entry für Asset ${asset.sys.id}...`);
    
    const imageEntry = await environment.createEntry('image', {
      fields: {
        internerName: {
          'de-DE': internalName
        },
        image: {
          'de-DE': {
            sys: {
              type: 'Link',
              linkType: 'Asset',
              id: asset.sys.id
            }
          }
        },
        altText: {
          'de-DE': description
        },
        copyright: {
          'de-DE': copyright || ''
        }
      }
    });
    
    console.log(`Image-Entry erstellt: ${imageEntry.sys.id}, veröffentliche...`);
    
    // Veröffentliche das Entry mit robuster Version-Handling
    try {
      await imageEntry.publish();
      console.log(`Image-Entry erfolgreich veröffentlicht: ${imageEntry.sys.id}`);
      return imageEntry;
    } catch (publishError) {
      if (publishError.message && publishError.message.includes('VersionMismatch') || 
          (publishError.status === 409 && publishError.statusText === 'Conflict')) {
        console.log(`Version-Konflikt beim Image-Entry ${imageEntry.sys.id}, hole aktuelle Version...`);
        
        try {
          // Hole das Entry erneut mit aktueller Version
          const freshEntry = await environment.getEntry(imageEntry.sys.id);
          console.log(`Aktuelle Entry-Version geholt: ${freshEntry.sys.version}`);
          
          // Versuche erneut zu publishen
          await freshEntry.publish();
          console.log(`Image-Entry erfolgreich veröffentlicht mit aktueller Version: ${imageEntry.sys.id}`);
          return freshEntry;
        } catch (retryError) {
          console.log(`Erneuter Publish-Versuch fehlgeschlagen, verwende Entry ohne Veröffentlichung: ${imageEntry.sys.id}`);
          console.log(`Image-Entry verfügbar (nicht veröffentlicht): ${imageEntry.sys.id}`);
          return imageEntry;
        }
      } else {
        console.error('Unbekannter Publish-Fehler:', publishError.message);
        throw publishError;
      }
    }
  } catch (error) {
    if (error.message && error.message.includes('unique') && error.message.includes('Same field value present in other entry')) {
      console.log(`Ghost Entry erkannt für ${internalName}, verwende Ghost Entry Logik...`);
      const entryIdMatch = error.message.match(/id":\s*"([^"]+)"/);
      if (entryIdMatch) {
              const ghostEntryId = entryIdMatch[1];
      const ghostEntry = await fixGhostEntrySupportMethod(ghostEntryId, 'image');
      if (ghostEntry) {
          return ghostEntry;
      } else {
          console.error('Ghost Entry Behandlung fehlgeschlagen');
          // Wenn Ghost Entry Behandlung fehlschlägt, überspringe diesen Entry
          console.log(`⚠️  Überspringe Entry aufgrund fehlgeschlagener Ghost Entry Behandlung`);
          return null;
      }
      } else {
        console.error('Konnte Ghost Entry ID nicht extrahieren');
        throw error;
      }
    } else {
      console.error('Fehler beim Erstellen des Image-Entries:', error);
      throw error;
    }
  }
}

async function processImagesFromBriefing(briefingText, environment, baseInternalName) {
  const imageEntries = [];
  const imageLinks = await extractImageLinks(briefingText);
  
  console.log(`Gefundene Bildlinks: ${imageLinks.length}`);
  
  if (imageLinks.length === 0) {
    console.log('Keine Bildlinks gefunden');
    return [];
  }
  
  for (let i = 0; i < imageLinks.length; i++) {
    const imageLink = imageLinks[i];
    console.log(`Verarbeite Bild ${i + 1}/${imageLinks.length}: ${imageLink.url}`);
    
    if (imageLink.isConverted) {
      console.log(`  → Google Drive Link konvertiert: ${imageLink.originalUrl} → ${imageLink.url}`);
    }
    
    if (imageLink.copyright) {
      console.log(`  → Copyright erkannt: ${imageLink.copyright}`);
    }
    
    try {
      // Bild von verschiedenen Quellen herunterladen und speichern
      console.log(`Lade Bild herunter und speichere lokal: ${imageLink.url}`);
      const imageData = await downloadImageFromVariousSources(imageLink.url);
      console.log(`Bild erfolgreich lokal gespeichert: ${imageData.localPath} (${imageData.filename})`);
      
      if (!imageData.isValidImage) {
        console.log(`  ⚠️  Bild ${i + 1} ist kein gültiges Bildformat - verwende Standard-Beschreibung`);
      }
      
      if (!imageData.isSupportedFormat) {
        console.log(`  ⚠️  Bild ${i + 1} hat ein möglicherweise nicht unterstütztes Format`);
      }
      
      // Bild mit KI analysieren (verwendet lokale Datei und Cache)
      console.log(`Analysiere lokales Bild mit KI...`);
      const aiAnalysis = await analyzeImageWithAI({ buffer: await readLocalImageForOpenAI(imageData.localPath), filename: imageData.filename }, imageData.isValidImage, imageLink.url);
      console.log(`KI-Analyse abgeschlossen: ${aiAnalysis.title}`);
      
      // Lese das Bild für Contentful Upload
      const imageBuffer = await readLocalImageForOpenAI(imageData.localPath);
      
      // Optimiere das Bild für Contentful (max 2000px Breite, hohe Qualität)
      const optimizedBuffer = await optimizeImage(imageBuffer, 2000);
      
      // Debug: Prüfe optimierten Buffer
      console.log(`Optimierter Buffer: ${optimizedBuffer.length} Bytes, Typ: ${typeof optimizedBuffer}`);
      
      // Validiere Buffer vor Upload
      if (!Buffer.isBuffer(optimizedBuffer)) {
        throw new Error('Optimierter Buffer ist kein gültiger Buffer');
      }
      
      if (optimizedBuffer.length === 0) {
        throw new Error('Optimierter Buffer ist leer');
      }
      
      // Bild zu Contentful hochladen
      console.log(`Lade optimiertes Bild zu Contentful hoch...`);
      const asset = await uploadImageToContentful(environment, optimizedBuffer, imageData.filename, 'image/jpeg', aiAnalysis);
      
      // Entry erstellen
      console.log(`Erstelle Image-Entry...`);
      const entry = await createImageEntry(environment, asset, aiAnalysis.description, imageData.filename, imageLink.copyright);
      
      console.log(`Bild ${i + 1} erfolgreich verarbeitet: Entry ${entry.sys.id}, Asset ${asset.sys.id}`);
      
      // Füge das Entry-Objekt hinzu
      imageEntries.push(entry);
      
      // Speichere auch die Metadaten für spätere Verwendung
      imageEntries.metadata = imageEntries.metadata || [];
      imageEntries.metadata.push({
        filename: imageData.filename,
        title: aiAnalysis.title,
        description: aiAnalysis.description,
        originalUrl: imageLink.originalUrl,
        downloadUrl: imageLink.url,
        lineNumber: imageLink.lineNumber,
        entryId: entry.sys.id,
        assetId: asset.sys.id,
        isConverted: imageLink.isConverted,
        copyright: imageLink.copyright,
        isValidImage: imageData.isValidImage,
        thumbnailUrl: `/temp_images/${imageData.filename}`,
        analysisStatus: imageData.isValidImage ? 'success' : 'warning',
        analysisMessage: imageData.isValidImage ? 'KI-Analyse erfolgreich' : 'Standard-Beschreibung verwendet (ungültiges Bildformat)'
      });
      
    } catch (error) {
      console.error(`❌ Fehler bei Bild ${i + 1}:`, error.message);
      console.error(`   URL: ${imageLink.url}`);
      console.error(`   Original URL: ${imageLink.originalUrl}`);
      
      // Kein Fallback-Entry erstellen - nur loggen
      console.log(`⚠️  Bild ${i + 1} übersprungen aufgrund von Fehler`);
    }
  }
  
  console.log(`Bildverarbeitung abgeschlossen: ${imageEntries.length} Einträge erstellt`);
  
  // Räume temporäre Bilder auf
  console.log('Räume temporäre Bilder auf...');
  cleanupTempImages();
  
  return imageEntries;
}

function convertGoogleDriveLink(url) {
  // Prüfe, ob es sich um einen Google Drive View-Link handelt
  const viewMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/);
  if (viewMatch) {
    const fileId = viewMatch[1];
    // Behalte die ursprüngliche URL für Google Drive API
    return url;
  }
  
  // Prüfe, ob es bereits ein Download-Link ist
  const downloadMatch = url.match(/drive\.google\.com\/uc\?export=download&id=([a-zA-Z0-9_-]+)/);
  if (downloadMatch) {
    return url; // Bereits konvertiert
  }
  
  // Prüfe, ob es ein direkter Link ist
  const directMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (directMatch) {
    const fileId = directMatch[1];
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  
  // Wenn keine Google Drive URL, gib die ursprüngliche URL zurück
  return url;
}

// Erstelle einen Ordner für temporäre Bilder
const TEMP_IMAGES_DIR = path.join(__dirname, 'temp_images');
if (!fs.existsSync(TEMP_IMAGES_DIR)) {
  fs.mkdirSync(TEMP_IMAGES_DIR, { recursive: true });
}

// Funktion zum lokalen Herunterladen und Speichern von Bildern
async function downloadAndSaveImage(imageUrl, filename) {
  try {
    console.log(`Lade Bild herunter und speichere lokal: ${imageUrl}`);
    
    // Timeout für Download hinzufügen
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_PROCESSING_TIMEOUT);
    
    // Verbesserte Headers für Google Drive
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/jpeg,image/png,image/gif,image/webp,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Referer': 'https://drive.google.com/',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'same-origin'
    };
    
    const response = await fetch(imageUrl, {
      headers: headers,
      signal: controller.signal,
      redirect: 'follow'
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // Prüfe, ob wir tatsächlich ein Bild erhalten haben oder eine HTML-Seite
    const isHtmlResponse = contentType.includes('text/html') || contentType.includes('text/plain');
    
    if (isHtmlResponse) {
      console.log(`Warnung: HTML-Antwort erhalten statt Bild. Content-Type: ${contentType}`);
      console.log('Versuche alternative Google Drive Download-Methoden...');
      
      // Versuche alternative Google Drive Download-URLs
      const fileIdMatch = imageUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (fileIdMatch) {
        const fileId = fileIdMatch[1];
        const alternativeUrls = [
          `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
          `https://drive.google.com/uc?export=download&id=${fileId}`,
          `https://docs.google.com/uc?export=download&id=${fileId}`,
          `https://drive.google.com/file/d/${fileId}/preview`
        ];
        
        for (const altUrl of alternativeUrls) {
          try {
            console.log(`Versuche alternative URL: ${altUrl}`);
            
            const altController = new AbortController();
            const altTimeoutId = setTimeout(() => altController.abort(), IMAGE_PROCESSING_TIMEOUT);
            
            const altResponse = await fetch(altUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/jpeg,image/png,image/gif,image/webp,*/*',
                'Referer': 'https://drive.google.com/',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'same-origin'
              },
              signal: altController.signal,
              redirect: 'follow'
            });
            
            clearTimeout(altTimeoutId);
            
            if (altResponse.ok) {
              const altBuffer = await altResponse.arrayBuffer();
              const altContentType = altResponse.headers.get('content-type') || 'image/jpeg';
              
              // Prüfe, ob die alternative Antwort tatsächlich ein Bild ist
              if (!altContentType.includes('text/html') && !altContentType.includes('text/plain')) {
                console.log(`Alternative URL erfolgreich: ${altContentType}`);
                
                // Prüfe Bildgröße
                if (altBuffer.byteLength > MAX_IMAGE_SIZE) {
                  throw new Error(`Bild ist zu groß: ${(altBuffer.byteLength / 1024 / 1024).toFixed(1)}MB (Maximum: ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`);
                }
                
                const filename = `google-drive-${fileId}.jpg`;
                console.log(`Bild erfolgreich heruntergeladen: ${filename} (${altBuffer.byteLength} bytes)`);
                
                return {
                  buffer: Buffer.from(altBuffer),
                  contentType: altContentType,
                  filename: filename,
                  isValidImage: true,
                  isSupportedFormat: true
                };
              }
            }
          } catch (altError) {
            console.log(`Alternative URL fehlgeschlagen: ${altUrl} - ${altError.message}`);
            continue;
          }
        }
      }
      
      // Wenn alle alternativen URLs fehlschlagen, erstelle einen Fallback
      console.log('Alle Google Drive Download-Versuche fehlgeschlagen. Erstelle Fallback...');
      throw new Error('Google Drive Download nicht möglich - alle Methoden fehlgeschlagen');
    }
    
    // Prüfe Bildgröße
    if (buffer.byteLength > MAX_IMAGE_SIZE) {
      throw new Error(`Bild ist zu groß: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB (Maximum: ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`);
    }
    
    // Speichere das Bild lokal
    const localPath = path.join(TEMP_IMAGES_DIR, filename);
    fs.writeFileSync(localPath, Buffer.from(buffer));
    
    console.log(`Bild erfolgreich lokal gespeichert: ${localPath} (${buffer.byteLength} bytes)`);
    
    // Prüfe, ob es sich um ein gültiges Bild handelt
    const isValidImage = contentType.startsWith('image/') || 
                        filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    
    if (!isValidImage) {
      console.log(`Warnung: Content-Type ${contentType} wird möglicherweise nicht von Contentful unterstützt`);
    }
    
    // Prüfe auf gültige Bildformate für Contentful
    const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const isSupportedFormat = supportedFormats.includes(contentType.toLowerCase());
    
    if (!isSupportedFormat) {
      console.log(`Warnung: Content-Type ${contentType} wird möglicherweise nicht von Contentful unterstützt`);
    }
    
    return {
      localPath: localPath,
      contentType: contentType,
      filename: filename,
      isValidImage: isValidImage,
      isSupportedFormat: isSupportedFormat
    };
  } catch (error) {
    console.error(`Fehler beim Herunterladen des Bildes: ${error.message}`);
    throw error;
  }
}

// Funktion zum Lesen eines lokalen Bildes für OpenAI
async function readLocalImageForOpenAI(localPath) {
  try {
    const imageBuffer = fs.readFileSync(localPath);
    return imageBuffer;
  } catch (error) {
    console.error(`Fehler beim Lesen der lokalen Bilddatei: ${error.message}`);
    throw error;
  }
}

// Funktion zum Aufräumen temporärer Bilder
function cleanupTempImages() {
  try {
    if (fs.existsSync(TEMP_IMAGES_DIR)) {
      const files = fs.readdirSync(TEMP_IMAGES_DIR);
      for (const file of files) {
        const filePath = path.join(TEMP_IMAGES_DIR, file);
        fs.unlinkSync(filePath);
        console.log(`Temporäre Datei gelöscht: ${filePath}`);
      }
    }
  } catch (error) {
    console.error(`Fehler beim Aufräumen temporärer Bilder: ${error.message}`);
  }
}

// Funktion zum Herunterladen von Bildern von verschiedenen Hosting-Diensten
async function downloadImageFromVariousSources(imageUrl) {
  try {
    console.log(`Versuche Bild herunterzuladen von: ${imageUrl}`);
    
    // Prüfe Google Drive Links
    const googleDriveMatch = imageUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (googleDriveMatch) {
      const fileId = googleDriveMatch[1];
      console.log(`Google Drive Link erkannt, File ID: ${fileId}`);
      
      // Versuche zuerst mit Google Drive API (falls verfügbar)
      if (driveService) {
        try {
          console.log('Versuche Google Drive API...');
          const apiResult = await downloadGoogleDriveFileWithAuth(fileId);
          
          // Speichere das Bild lokal
          const localFilename = apiResult.filename || `google-drive-${fileId}.jpg`;
          const localPath = path.join(TEMP_IMAGES_DIR, localFilename);
          fs.writeFileSync(localPath, apiResult.buffer);
          
          console.log(`Bild erfolgreich lokal gespeichert: ${localPath} (${apiResult.buffer.length} bytes)`);
          
          return {
            localPath: localPath,
            contentType: apiResult.contentType,
            filename: localFilename,
            isValidImage: true,
            isSupportedFormat: true
          };
        } catch (apiError) {
          console.log(`Google Drive API fehlgeschlagen: ${apiError.message}`);
          console.log('Versuche Fallback-Methoden...');
        }
      }
      
      // Fallback: Versuche normale Download-Methoden
      return await downloadAndSaveImage(imageUrl, `google-drive-${fileId}.jpg`);
    }
    
    // Prüfe verschiedene Bildhosting-Dienste
    const isImgur = imageUrl.includes('imgur.com');
    const isGitHub = imageUrl.includes('github.com') || imageUrl.includes('raw.githubusercontent.com');
    const isCloudinary = imageUrl.includes('cloudinary.com');
    const isDirectImage = imageUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    
    // Für direkte Bildlinks
    if (isDirectImage) {
      console.log('Direkter Bildlink erkannt');
      return await downloadAndSaveImage(imageUrl, `direct-image-${Date.now()}.jpg`);
    }
    
    // Für Imgur Links
    if (isImgur) {
      console.log('Imgur Link erkannt');
      const imgurUrl = imageUrl.replace('/gallery/', '/').replace('/a/', '/');
      return await downloadAndSaveImage(imgurUrl, `imgur-${Date.now()}.jpg`);
    }
    
    // Für GitHub Links
    if (isGitHub) {
      console.log('GitHub Link erkannt');
      const githubUrl = imageUrl.replace('/blob/', '/raw/');
      return await downloadAndSaveImage(githubUrl, `github-${Date.now()}.jpg`);
    }
    
    // Für Cloudinary Links
    if (isCloudinary) {
      console.log('Cloudinary Link erkannt');
      return await downloadAndSaveImage(imageUrl, `cloudinary-${Date.now()}.jpg`);
    }
    
    // Fallback: Versuche es als normalen Link
    console.log('Versuche als normalen Link');
    return await downloadAndSaveImage(imageUrl, `fallback-${Date.now()}.jpg`);
    
  } catch (error) {
    console.error(`Fehler beim Herunterladen von ${imageUrl}:`, error.message);
    throw error;
  }
}

// Google Drive API Funktion zum Herunterladen von Dateien mit Authentifizierung
async function downloadGoogleDriveFileWithAuth(fileId) {
  try {
    if (!driveService) {
      throw new Error('Google Drive API nicht initialisiert. Bitte führen Sie initializeGoogleDriveAPI() aus.');
    }

    console.log(`Lade Google Drive Datei mit Authentifizierung herunter: ${fileId}`);

          // Versuche zuerst, die Datei direkt zu finden (auch in Shared Drives)
      try {
        // Hole Datei-Metadaten
        const fileMetadata = await driveService.files.get({
          fileId: fileId,
          fields: 'name,mimeType,size,permissions,owners',
          supportsAllDrives: true
        });

        console.log(`Datei gefunden: ${fileMetadata.data.name} (${fileMetadata.data.mimeType})`);
        console.log(`Besitzer: ${fileMetadata.data.owners?.[0]?.emailAddress || 'Unbekannt'}`);

        // Prüfe, ob es sich um ein Bild handelt
        if (!fileMetadata.data.mimeType.startsWith('image/')) {
          throw new Error('Datei ist kein Bild');
        }

        // Lade Datei herunter
        const response = await driveService.files.get({
          fileId: fileId,
          alt: 'media',
          supportsAllDrives: true
        }, {
          responseType: 'arraybuffer'
        });

        const buffer = Buffer.from(response.data);
        const filename = fileMetadata.data.name || `google-drive-${fileId}.jpg`;

        console.log(`Google Drive Datei erfolgreich heruntergeladen: ${filename} (${buffer.length} bytes)`);

        return {
          buffer: buffer,
          contentType: fileMetadata.data.mimeType,
          filename: filename,
          isValidImage: true,
          isSupportedFormat: true
        };

      } catch (fileError) {
        console.log(`Datei nicht direkt gefunden, versuche alternative Methoden...`);
      
      // Versuche, die Datei über eine Suche zu finden
      try {
        console.log(`Suche nach Datei mit ID: ${fileId}`);
        
        // Versuche verschiedene Suchmethoden
        const searchQueries = [
          `id = '${fileId}'`,
          `name contains '${fileId}'`
        ];
        
        for (const query of searchQueries) {
          try {
            console.log(`Versuche Suchabfrage: ${query}`);
            const searchResponse = await driveService.files.list({
              q: query,
              fields: 'files(id,name,mimeType,size,permissions,owners)',
              spaces: 'drive',
              includeItemsFromAllDrives: true,
              supportsAllDrives: true,
              corpora: 'allDrives'
            });

            if (searchResponse.data.files && searchResponse.data.files.length > 0) {
              const file = searchResponse.data.files[0];
              console.log(`Datei über Suche gefunden: ${file.name} (${file.mimeType})`);
              console.log(`Datei ID: ${file.id}`);
              
              // Lade Datei herunter
              const response = await driveService.files.get({
                fileId: file.id,
                alt: 'media'
              }, {
                responseType: 'arraybuffer'
              });

              const buffer = Buffer.from(response.data);
              const filename = file.name || `google-drive-${fileId}.jpg`;

              console.log(`Google Drive Datei erfolgreich heruntergeladen: ${filename} (${buffer.length} bytes)`);

              return {
                buffer: buffer,
                contentType: file.mimeType,
                filename: filename,
                isValidImage: true,
                isSupportedFormat: true
              };
            }
          } catch (queryError) {
            console.log(`Suchabfrage fehlgeschlagen: ${queryError.message}`);
            continue;
          }
        }
        
        // Wenn alle Suchabfragen fehlschlagen, versuche direkten Zugriff
        console.log(`Versuche direkten Zugriff auf Datei ID: ${fileId}`);
        const directResponse = await driveService.files.get({
          fileId: fileId,
          alt: 'media'
        }, {
          responseType: 'arraybuffer'
        });

        const buffer = Buffer.from(directResponse.data);
        const filename = `google-drive-${fileId}.jpg`;

        console.log(`Google Drive Datei erfolgreich heruntergeladen: ${filename} (${buffer.length} bytes)`);

        return {
          buffer: buffer,
          contentType: 'image/jpeg', // Fallback
          filename: filename,
          isValidImage: true,
          isSupportedFormat: true
        };
        
      } catch (searchError) {
        console.error(`Fehler bei der Dateisuche: ${searchError.message}`);
        throw new Error(`Datei nicht gefunden: ${searchError.message}`);
      }
    }

  } catch (error) {
    console.error(`Fehler beim Herunterladen der Google Drive Datei mit Authentifizierung: ${error.message}`);
    throw error;
  }
}

// SSE für Fortschritts-Updates
let progressClients = [];

app.get('/api/progress', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Sende initiale Verbindung
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE Verbindung hergestellt' })}\n\n`);

  // Ping alle 30 Sekunden um Verbindung zu halten
  const pingInterval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
  }, 30000);

  // Client zur Liste hinzufügen
  const clientId = Date.now();
  progressClients.push({ id: clientId, res });

  // Cleanup bei Verbindungsabbruch
  req.on('close', () => {
    clearInterval(pingInterval);
    progressClients = progressClients.filter(client => client.id !== clientId);
  });
});

// Funktion zum Senden von Fortschritts-Updates
function sendProgressUpdate(data) {
  progressClients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// API Endpunkte
app.post('/api/process-images', imageProcessingLimiter, upload.single('briefing'), async (req, res) => {
  try {
    console.log('Bildverarbeitung gestartet...');
    
    // Sende Start-Update
    sendProgressUpdate({
      type: 'progress',
      current: 0,
      total: 0,
      message: 'Bildverarbeitung gestartet...'
    });
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'Keine Datei hochgeladen' 
      });
    }
    
    const briefingText = req.file.buffer ? req.file.buffer.toString('utf8') : fs.readFileSync(req.file.path, 'utf8');
    
    // Validiere Briefing-Format
    const validation = validateBriefingFormat(briefingText);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Briefing-Format ungültig: ${validation.errors.join(', ')}`
      });
    }
    
    // Extrahiere Bildlinks
    const imageLinks = await extractImageLinks(briefingText);
    
    if (imageLinks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Keine Bildlinks im Briefing gefunden'
      });
    }
    
    console.log(`Verarbeite ${imageLinks.length} Bilder...`);
    
    // Sende Update mit Gesamtanzahl
    sendProgressUpdate({
      type: 'progress',
      current: 0,
      total: imageLinks.length,
      message: `Starte Verarbeitung von ${imageLinks.length} Bildern...`
    });
    
    // Bilder verarbeiten (nur Vorschau und GPT-Analyse, kein Contentful-Upload)
    const processedImages = [];
    
    for (let i = 0; i < imageLinks.length; i++) {
      const imageLink = imageLinks[i];
      console.log(`Verarbeite Bild ${i + 1}/${imageLinks.length}: ${imageLink.originalUrl}`);
      
      // Sende Fortschritts-Update
      sendProgressUpdate({
        type: 'progress',
        current: i + 1,
        total: imageLinks.length,
        message: `Verarbeite Bild ${i + 1}/${imageLinks.length}...`
      });
      
      try {
        // Bild herunterladen
        const downloadResult = await downloadImage(imageLink.url);
        const imageBuffer = downloadResult.buffer;
        
        // Debug: Zeige alle Eigenschaften des downloadResult
        console.log('DownloadResult Eigenschaften:', Object.keys(downloadResult));
        console.log('DownloadResult.filename:', downloadResult.filename);
        console.log('DownloadResult.contentType:', downloadResult.contentType);
        
        // Verwende den echten Dateinamen aus Google Drive
        const realFilename = downloadResult.filename || `image-${i + 1}.jpg`;
        console.log(`Echter Dateiname: ${realFilename}`);
        
        // Sende Fortschritts-Update für dieses spezifische Bild
        sendProgressUpdate({
          type: 'progress',
          current: i + 1,
          total: imageLinks.length,
          message: `Verarbeite ${realFilename}...`
        });
        
        // GPT-Analyse durchführen
        const aiAnalysis = await analyzeImageWithAI({ buffer: imageBuffer, filename: realFilename }, true, imageLink.url);
        
        // Optimiere das Bild für Contentful (max 2000px Breite, hohe Qualität)
        const optimizedBuffer = await optimizeImage(imageBuffer, 2000);
        
        // Speichere das optimierte Bild temporär für die Vorschau
        const tempFilename = `preview-${i + 1}.jpg`;
        const tempPath = path.join(TEMP_IMAGES_DIR, tempFilename);
        fs.writeFileSync(tempPath, optimizedBuffer);
        
        // Thumbnail-URL erstellen (lokale URL für Vorschau)
        const thumbnailUrl = `/temp_images/${tempFilename}`;
        console.log(`Thumbnail URL: ${thumbnailUrl}`);
        console.log(`Bild gespeichert unter: ${tempPath}`);
        
        // Verarbeitetes Bild-Objekt erstellen
        const processedImage = {
          filename: realFilename,
          title: aiAnalysis.title || 'E-Bike Komponente',
          description: aiAnalysis.description || 'E-Bike oder Fahrrad-bezogene Komponente für die Website.',
          originalUrl: imageLink.originalUrl,
          downloadUrl: imageLink.url,
          lineNumber: imageLink.lineNumber,
          entryId: null, // Wird später beim Upload gesetzt
          assetId: null, // Wird später beim Upload gesetzt
          isConverted: imageLink.isConverted,
          copyright: imageLink.copyright,
          isValidImage: true,
          thumbnailUrl: thumbnailUrl,
          analysisStatus: 'success',
          analysisMessage: 'KI-Analyse erfolgreich',
          error: null
        };
        
        console.log(`ProcessedImage für ${realFilename}:`, {
          filename: processedImage.filename,
          title: processedImage.title,
          thumbnailUrl: processedImage.thumbnailUrl
        });
        
        processedImages.push(processedImage);
        console.log(`✅ Bild ${i + 1} erfolgreich verarbeitet`);
        
        // Sende Erfolgs-Update
        sendProgressUpdate({
          type: 'progress',
          current: i + 1,
          total: imageLinks.length,
          message: `Bild ${i + 1} erfolgreich verarbeitet`
        });
        
      } catch (error) {
        console.error(`Fehler bei Bild ${i + 1}:`, error.message);
        
        // Fallback-Entry für fehlgeschlagene Bilder
        const fallbackImage = {
          filename: `fallback-${i + 1}.jpg`,
          title: 'E-Bike Komponente',
          description: 'E-Bike oder Fahrrad-bezogene Komponente für die Website.',
          originalUrl: imageLink.originalUrl,
          downloadUrl: imageLink.url,
          lineNumber: imageLink.lineNumber,
          entryId: null,
          assetId: null,
          isConverted: imageLink.isConverted,
          copyright: imageLink.copyright,
          isValidImage: false,
          thumbnailUrl: '/temp_images/placeholder.png',
          analysisStatus: 'error',
          analysisMessage: `Fehler: ${error.message}`,
          error: error.message
        };
        
        processedImages.push(fallbackImage);
      }
    }
    
    console.log('Bildverarbeitung erfolgreich abgeschlossen');
    
    // Sende finales Update
    sendProgressUpdate({
      type: 'complete',
      current: imageLinks.length,
      total: imageLinks.length,
      message: 'Bildverarbeitung erfolgreich abgeschlossen',
      images: processedImages,
      totalProcessed: processedImages.length
    });
    
    // Debug: Zeige alle verarbeiteten Bilder
    console.log('=== Finale verarbeitete Bilder ===');
    processedImages.forEach((img, index) => {
      console.log(`Bild ${index + 1}:`, {
        filename: img.filename,
        title: img.title,
        thumbnailUrl: img.thumbnailUrl
      });
    });
    console.log('=== Ende finale Bilder ===');
    
    // Sende finales Ergebnis
    res.json({
      success: true,
      data: {
        images: processedImages,
        totalProcessed: processedImages.length,
        message: 'Bilder erfolgreich analysiert (Vorschau-Modus)'
      }
    });
    
  } catch (error) {
    console.error('Fehler bei der Bildverarbeitung:', error);
    res.status(500).json({
      success: false,
      error: `Server-Fehler: ${error.message}`
    });
  }
});



// Neuer Endpunkt für einzelnes Bild-Upload (deaktiviert - nur Vorschau-Modus)
app.post('/api/upload-single-image', async (req, res) => {
  try {
    const { imageData } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ 
        success: false, 
        error: 'Keine Bilddaten erhalten' 
      });
    }

    console.log('Einzelnes Bild-Upload angefordert:', imageData.filename);

    // Contentful-Upload ist deaktiviert - nur Vorschau-Modus
    return res.status(400).json({
      success: false,
      error: 'Contentful-Upload ist derzeit deaktiviert. Bitte verwenden Sie den Vorschau-Modus.'
    });

  } catch (error) {
    console.error('Fehler beim einzelnen Bild-Upload:', error);
    res.status(500).json({
      success: false,
      error: `Server-Fehler: ${error.message}`
    });
  }
});

// Endpunkt für Datei-Upload und Validierung
app.post('/api/upload', upload.single('briefing'), async (req, res) => {
  try {
    console.log('Datei-Upload und Validierung gestartet...');
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'Keine Datei hochgeladen' 
      });
    }
    
    const briefingText = req.file.buffer ? req.file.buffer.toString('utf8') : fs.readFileSync(req.file.path, 'utf8');
    
    // Validiere Briefing-Format
    const validation = validateBriefingFormat(briefingText);
    const analysis = analyzeContentTypes(briefingText);
    const metaInfo = extractMetaInfo(briefingText);
    const slug = extractSlug(briefingText);
    
    // Extrahiere lokale Informationen
    const localInfo = extractLocalInfo(briefingText);
    
    // Extrahiere Bildlinks für Vorschau
    const imageLinks = await extractImageLinks(briefingText);
    
    console.log('Datei-Validierung erfolgreich abgeschlossen');
    
    // Debug: Log what we're sending to frontend
    console.log('\n=== Sending to Frontend ===');
    console.log('imageLinks:', imageLinks);
    console.log('imageLinks.length:', imageLinks.length);
    console.log('analysis:', analysis);
    console.log('localInfo:', localInfo);
    console.log('=== End Frontend Data ===\n');
    
    res.json({
      success: true,
      data: {
        filename: req.file.originalname,
        size: req.file.size,
        briefingText: briefingText,
        validation: {
          isValid: validation.isValid,
          errors: validation.errors,
          missingFields: validation.missingFields,
          hasProductMarker: validation.hasProductMarker
        },
        contentTypes: analysis.contentTypes,
        pageData: analysis.pageData,
        faqs: analysis.faqs,
        richTextStructure: analysis.richTextStructure,
        metaInfo: metaInfo,
        slug: slug,
        localInfo: localInfo,
        imageLinks: imageLinks,
        message: 'Datei erfolgreich validiert'
      }
    });
    
  } catch (error) {
    console.error('Fehler bei der Datei-Validierung:', error);
    res.status(500).json({
      success: false,
      error: `Server-Fehler: ${error.message}`
    });
  }
});

// Contentful Upload Endpoint für alle Bilder
app.post('/api/upload-all-images', async (req, res) => {
  try {
    const { images } = req.body;
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Keine Bilder zum Hochladen bereitgestellt'
      });
    }

    console.log(`Starte Upload von ${images.length} Bildern zu Contentful...`);
    
    // Prüfe ob briefing-importer.js läuft
    const isBriefingImporterRunning = process.argv.includes('briefing-importer.js');
    if (isBriefingImporterRunning) {
      console.log('⚠️  briefing-importer.js läuft parallel - mögliche Konflikte!');
    }

    // Contentful Client initialisieren
    const client = contentful.createClient({
      accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    // Space und Environment abrufen
    const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
    const environment = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT_ID || 'master');

    const uploadResults = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      try {
        console.log(`Lade Bild ${i + 1}/${images.length} hoch: ${image.filename}`);
        
        // Prüfe, ob Bild bereits hochgeladen wurde (hat assetId)
        if (image.assetId) {
          console.log(`✅ Bild ${i + 1} bereits hochgeladen: Asset ${image.assetId}`);
          uploadResults.push({
            filename: image.filename,
            success: true,
            assetId: image.assetId,
            entryId: image.entryId || null,
            title: image.title,
            description: image.description,
            alreadyUploaded: true
          });
          successCount++;
          continue;
        }
        
                                        // Lade das optimierte Bild aus dem temp_images Verzeichnis
        const tempImagePath = path.join(__dirname, 'temp_images', `preview-${i + 1}.jpg`);
        const uploadImagePath = path.join(__dirname, 'temp_images', `upload-${i + 1}.jpg`);
        const previewUploadPath = path.join(__dirname, 'temp_images', `preview-upload-${i + 1}.jpg`);
        const driveImagePath = path.join(__dirname, 'temp_images', `drive-${i + 1}.jpg`);
        
        // Versuche verschiedene Bildpfade basierend auf dem Bildtyp
        let imageBuffer;
        let imagePath;
        
        // Extrahiere Index aus dem Bild-Objekt oder verwende Loop-Index
        const imageIndex = image.lineNumber || (i + 1);
        
        // Prüfe zuerst spezifische Pfade basierend auf dem Bildtyp
        if (image.thumbnailUrl && image.thumbnailUrl.includes('preview-upload-')) {
          // Upload-Bilder
          const correctPreviewUploadPath = path.join(__dirname, 'temp_images', `preview-upload-${imageIndex}.jpg`);
          const correctUploadPath = path.join(__dirname, 'temp_images', `upload-${imageIndex}.jpg`);
          
          if (fs.existsSync(correctPreviewUploadPath)) {
            imageBuffer = fs.readFileSync(correctPreviewUploadPath);
            imagePath = correctPreviewUploadPath;
            console.log(`Verwende preview-upload-Bild: ${correctPreviewUploadPath}`);
          } else if (fs.existsSync(correctUploadPath)) {
            imageBuffer = fs.readFileSync(correctUploadPath);
            imagePath = correctUploadPath;
            console.log(`Verwende upload-Bild: ${correctUploadPath}`);
          } else {
            console.error(`❌ Preview-Upload Bild nicht gefunden: ${image.filename}`);
            throw new Error(`Preview-Upload Bild nicht gefunden: ${image.filename}`);
          }
        } else if (image.thumbnailUrl && image.thumbnailUrl.includes('drive-')) {
          // Drive-Bilder
          const correctDrivePath = path.join(__dirname, 'temp_images', `drive-${imageIndex}.jpg`);
          if (fs.existsSync(correctDrivePath)) {
            imageBuffer = fs.readFileSync(correctDrivePath);
            imagePath = correctDrivePath;
            console.log(`Verwende drive-Bild: ${correctDrivePath}`);
          } else {
            console.error(`❌ Drive-Bild nicht gefunden: ${image.filename}`);
            throw new Error(`Drive-Bild nicht gefunden: ${image.filename}`);
          }
        } else {
          // Standard-Prüfung mit korrekten Indizes
          const correctUploadPath = path.join(__dirname, 'temp_images', `upload-${imageIndex}.jpg`);
          const correctPreviewUploadPath = path.join(__dirname, 'temp_images', `preview-upload-${imageIndex}.jpg`);
          const correctDrivePath = path.join(__dirname, 'temp_images', `drive-${imageIndex}.jpg`);
          const correctTempPath = path.join(__dirname, 'temp_images', `preview-${imageIndex}.jpg`);
          const correctFilenameBasedPath = path.join(__dirname, 'temp_images', image.filename); // Für echte Dateinamen
          
          if (fs.existsSync(correctFilenameBasedPath)) {
            imageBuffer = fs.readFileSync(correctFilenameBasedPath);
            imagePath = correctFilenameBasedPath;
            console.log(`Verwende echtes Bild basierend auf Dateiname: ${correctFilenameBasedPath}`);
          } else if (fs.existsSync(correctUploadPath)) {
            imageBuffer = fs.readFileSync(correctUploadPath);
            imagePath = correctUploadPath;
            console.log(`Verwende upload-Bild: ${correctUploadPath}`);
          } else if (fs.existsSync(correctDrivePath)) {
            imageBuffer = fs.readFileSync(correctDrivePath);
            imagePath = correctDrivePath;
            console.log(`Verwende drive-Bild: ${correctDrivePath}`);
          } else {
            // KEIN FALLBACK - nur Fehler melden
            console.error(`❌ Bild nicht gefunden: ${image.filename}`);
            console.error(`Geprüfte Pfade:`);
            console.error(`- ${correctFilenameBasedPath}`);
            console.error(`- ${correctUploadPath}`);
            console.error(`- ${correctDrivePath}`);
            throw new Error(`Bild nicht gefunden: ${image.filename}`);
          }
        }
        
        if (!imageBuffer) {
          throw new Error(`Bild nicht gefunden für ${image.filename}. Geprüfte Pfade: ${uploadImagePath}, ${previewUploadPath}, ${driveImagePath}, ${tempImagePath}`);
        }
        
        console.log(`Bild gefunden: ${imagePath}, Größe: ${imageBuffer.length} bytes`);
        
        // Verwende die echten KI-Analyse-Daten aus der Bildverarbeitung
        let aiAnalysis;
        
        if (image.aiAnalysis) {
          // Verwende die gespeicherte KI-Analyse
          aiAnalysis = image.aiAnalysis;
          console.log(`Verwende gespeicherte KI-Analyse für ${image.filename}:`);
        } else {
          // Fallback: Verwende die Titel/Beschreibung aus dem Bild-Objekt
          aiAnalysis = {
            title: image.title || `E-Bike Komponente: ${image.filename}`,
            description: image.description || `Detaillierte Beschreibung der E-Bike Komponente ${image.filename}`
          };
          console.log(`Verwende Fallback-KI-Analyse für ${image.filename}:`);
        }
        
        console.log(`Titel: "${aiAnalysis.title}"`);
        console.log(`Beschreibung: "${aiAnalysis.description}"`);

        // Prüfe auf Ghost-Entry für Bild-Assets
        console.log('🔍 Prüfe auf Ghost-Entry für Bild-Assets...');
        const ghostAssetId = '2VIcMin7nXxQvLZPuNmEf4'; // Bekannte Ghost-Asset ID
        
        try {
          await environment.getAsset(ghostAssetId);
          console.log('⚠️  Ghost-Asset gefunden! Führe Support-Verfahren durch...');
          // Für Assets verwenden wir eine andere Methode
          console.log('🗑️  Lösche Ghost-Asset direkt...');
          const ghostAsset = await environment.getAsset(ghostAssetId);
          await ghostAsset.delete();
          console.log('✅ Ghost-Asset erfolgreich gelöscht');
        } catch (ghostError) {
          console.log('✅ Kein Ghost-Asset gefunden - fahre normal fort');
        }
        
        // Upload zu Contentful
        const asset = await uploadImageToContentful(
          environment, 
          imageBuffer, 
          image.filename, 
          'image/jpeg', 
          aiAnalysis
        );

        // Entry erstellen
        const entry = await createImageEntry(
          environment,
          asset,
          image.description,
          `image-${i + 1}`,
          image.copyright
        );

        uploadResults.push({
          filename: image.filename,
          success: true,
          assetId: asset.sys.id,
          entryId: entry.sys.id,
          title: image.title,
          description: image.description
        });

        successCount++;
        console.log(`✅ Bild ${i + 1} erfolgreich hochgeladen: ${asset.sys.id}`);

      } catch (error) {
        console.error(`❌ Fehler beim Upload von Bild ${i + 1}:`, error.message);
        
        uploadResults.push({
          filename: image.filename,
          success: false,
          error: error.message
        });

        errorCount++;
      }
    }

    console.log(`Upload abgeschlossen: ${successCount} erfolgreich, ${errorCount} fehlgeschlagen`);

    res.json({
      success: true,
      data: {
        totalImages: images.length,
        successCount,
        errorCount,
        results: uploadResults
      }
    });

  } catch (error) {
    console.error('Fehler beim Upload aller Bilder:', error);
    res.status(500).json({
      success: false,
      error: `Server-Fehler: ${error.message}`
    });
  }
});

// Briefing-Import Endpunkt
app.post('/api/import-briefing', upload.single('briefing'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'Keine Datei hochgeladen' 
      });
    }
    
    const briefingText = req.file.buffer ? req.file.buffer.toString('utf8') : fs.readFileSync(req.file.path, 'utf8');
    
    console.log('Empfange Briefing-Import Anfrage...');
    
    const result = await importBriefingToContentful(briefingText);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Fehler beim Briefing-Import:', error);
    res.status(500).json({
      success: false,
      error: `Server-Fehler: ${error.message}`
    });
  }
});

// Hilfsfunktion für Briefing-Import zu Contentful (basierend auf briefing-importer.js)
async function importBriefingToContentful(briefingText) {
  try {
    debugUploadStep('IMPORT_START', { briefingLength: briefingText.length });
    
    // 1. Upload-Diagnose durchführen
    debugUploadStep('DIAGNOSE_START');
    const diagnosis = await diagnoseUploadProcess(briefingText);
    debugUploadStep('DIAGNOSE_COMPLETE', diagnosis);
    
    // 2. Contentful Client initialisieren
    debugUploadStep('CONTENTFUL_INIT_START');
    const client = contentful.createClient({
      accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    // Space und Environment abrufen
    const space = await monitorUploadStep('getSpace', () => client.getSpace(process.env.CONTENTFUL_SPACE_ID));
    const environment = await monitorUploadStep('getEnvironment', () => space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT_ID || 'master'));
    debugUploadStep('CONTENTFUL_INIT_COMPLETE', { spaceName: space.name, environmentName: environment.name });

    // 3. Briefing-Daten extrahieren
    debugUploadStep('PAGE_DATA_EXTRACTION_START');
    const pageData = extractPageData(briefingText);
    debugUploadStep('PAGE_DATA_EXTRACTION_COMPLETE', pageData);

    const createdEntries = [];
    let imageEntries = []; // Definiere imageEntries außerhalb des try-catch

    // 1. Bilder verarbeiten und separate Image-Entries erstellen
    // Prüfe, ob Bilder bereits hochgeladen wurden (überspringe dann die Bildverarbeitung)
    const skipImageProcessing = process.env.SKIP_IMAGE_PROCESSING === 'true' || global.skipImageProcessing === true;
    
    if (skipImageProcessing) {
      console.log('⚠️  Bildverarbeitung übersprungen (Bilder bereits hochgeladen)');
      debugUploadStep('IMAGE_PROCESSING_SKIPPED', { reason: 'Bilder bereits hochgeladen' });
      // Auch wenn Bildverarbeitung übersprungen wird, müssen wir die Bilder für Bild-Text-Kombinationen verarbeiten
      try {
        imageEntries = await monitorUploadStep('processImages', () => processImagesFromBriefing(briefingText, environment, pageData.internalName));
        debugUploadStep('IMAGE_PROCESSING_COMPLETE', { totalEntries: imageEntries.length });
        
        // Füge nur die erfolgreichen Image-Entries hinzu
        const successfulImageEntries = imageEntries.filter(entry => entry && entry.sys && entry.sys.id);
        debugUploadStep('IMAGE_ENTRIES_FILTERED', { 
          total: imageEntries.length, 
          successful: successfulImageEntries.length,
          failed: imageEntries.length - successfulImageEntries.length
        });
        createdEntries.push(...successfulImageEntries);
        
        if (successfulImageEntries.length === 0) {
          debugUploadStep('IMAGE_PROCESSING_WARNING', { message: 'Keine Bilder erfolgreich verarbeitet!' });
        }
      } catch (error) {
        debugUploadStep('IMAGE_PROCESSING_ERROR', { error: error.message });
        imageEntries = []; // Setze auf leeres Array bei Fehler
      }
    } else {
      debugUploadStep('IMAGE_PROCESSING_START');
      try {
        imageEntries = await monitorUploadStep('processImages', () => processImagesFromBriefing(briefingText, environment, pageData.internalName));
        debugUploadStep('IMAGE_PROCESSING_COMPLETE', { totalEntries: imageEntries.length });
        
        // Füge nur die erfolgreichen Image-Entries hinzu
        const successfulImageEntries = imageEntries.filter(entry => entry && entry.sys && entry.sys.id);
        debugUploadStep('IMAGE_ENTRIES_FILTERED', { 
          total: imageEntries.length, 
          successful: successfulImageEntries.length,
          failed: imageEntries.length - successfulImageEntries.length
        });
        createdEntries.push(...successfulImageEntries);
        
        if (successfulImageEntries.length === 0) {
          debugUploadStep('IMAGE_PROCESSING_WARNING', { message: 'Keine Bilder erfolgreich verarbeitet!' });
        }
      } catch (error) {
        debugUploadStep('IMAGE_PROCESSING_ERROR', { error: error.message });
        imageEntries = []; // Setze auf leeres Array bei Fehler
      }
    }

    // 2. Bild-Text-Kombinationen mit CTA erstellen
    console.log('\nStarte Bild-Text-Kombinationen...');
    let imageTextCombinations = [];
    try {
      imageTextCombinations = await createImageTextCombinations(environment, imageEntries, briefingText, pageData.internalName);
      console.log(`Bild-Text-Kombinationen erstellt: ${imageTextCombinations.length}`);
      
      // Füge alle Bild-Text-Entries hinzu
      imageTextCombinations.forEach(combination => {
        if (combination.imageTextEntry) {
          createdEntries.push(combination.imageTextEntry);
        }
        if (combination.ctaEntry) {
          createdEntries.push(combination.ctaEntry);
        }
      });
    } catch (error) {
      console.error('❌ Fehler bei Bild-Text-Kombinationen:', error);
      console.log('⚠️  Fahre ohne Bild-Text-Kombinationen fort...');
    }

    // 3. Content von FAQs bereinigen
    console.log('\nBereinige Content von FAQs...');
    const cleanedContent = cleanContentFromFAQs(briefingText);
    console.log(`Content bereinigt: ${cleanedContent.length} Zeichen übrig`);

    // 4. Rich-Text-Segmente aus bereinigtem Content erstellen
    console.log('\nStarte Rich Text Erstellung...');
    const richTextSegments = await createRichTextSegments(environment, cleanedContent, pageData.internalName);
    createdEntries.push(...richTextSegments.filter(segment => segment !== null));

    // 5. FAQ-Accordion erstellen (basierend auf briefing-importer.js)
    console.log('\nErstelle FAQs...');
    const faqs = extractFAQs(briefingText);
    console.log(`Gefundene FAQs: ${faqs.length}`);
    
    let accordion = null;
    if (faqs.length > 0) {
      accordion = await createFAQAccordion(environment, faqs, pageData.internalName);
      if (accordion) {
        createdEntries.push(accordion);
      }
    }

    // 6. Hauptseite erstellen (basierend auf briefing-importer.js)
    console.log('\nErstelle Hauptseite...');
    const page = await createPage(environment, pageData, richTextSegments, accordion, imageTextCombinations);
    createdEntries.push(page);

    console.log(`Briefing-Import abgeschlossen: ${createdEntries.length} Entries erstellt`);
    
    // Detaillierte Rückgabe mit Status-Informationen
    const result = {
      success: true,
      entries: createdEntries,
      summary: {
        totalEntries: createdEntries.length,
        imageEntries: imageEntries?.filter(entry => entry && entry.sys && entry.sys.id).length || 0,
        imageTextCombinations: imageTextCombinations?.length || 0,
        richTextSegments: richTextSegments?.filter(segment => segment !== null).length || 0,
        faqAccordion: accordion ? 1 : 0,
        mainPage: 1
      },
      details: {
        imageEntries: imageEntries || [],
        imageTextCombinations: imageTextCombinations || [],
        pageData: pageData
      }
    };
    
    console.log('📊 Import-Zusammenfassung:', result.summary);
    return result;

  } catch (error) {
    console.error('Fehler beim Briefing-Import:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Google Drive Ordner-Verarbeitung
app.post('/api/process-drive-folder', async (req, res) => {
  try {
    const { folderUrl } = req.body;
    
    if (!folderUrl) {
      return res.status(400).json({
        success: false,
        error: 'Keine Ordner-URL bereitgestellt'
      });
    }

    console.log('Verarbeite Google Drive Ordner:', folderUrl);
    
    // Extrahiere Folder ID aus der URL
    const folderId = convertGoogleDriveLink(folderUrl);
    
    if (!folderId) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Google Drive Ordner-URL'
      });
    }

    // Lade alle Bilder aus dem Ordner
    const images = await processDriveFolder(folderId);
    
    res.json({
      success: true,
      data: {
        images: images
      }
    });

  } catch (error) {
    console.error('Fehler bei der Google Drive Ordner-Verarbeitung:', error);
    res.status(500).json({
      success: false,
      error: `Server-Fehler: ${error.message}`
    });
  }
});

// Hilfsfunktion für Google Drive Ordner-Verarbeitung
async function processDriveFolder(folderId) {
  try {
    console.log(`Lade Bilder aus Google Drive Ordner: ${folderId}`);
    
    // Lade alle Dateien aus dem Ordner
    const response = await driveService.files.list({
      q: `'${folderId}' in parents and (mimeType contains 'image/')`,
      fields: 'files(id,name,mimeType,webContentLink)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: 'allDrives'
    });

    const files = response.data.files || [];
    console.log(`Gefundene Bilder im Ordner: ${files.length}`);

    const processedImages = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`Verarbeite Bild ${i + 1}/${files.length}: ${file.name}`);
      
      try {
        // Lade Bild herunter
        const downloadResult = await downloadGoogleDriveFileWithAuth(file.id);
        
        if (!downloadResult.isValidImage) {
          console.log(`Überspringe ${file.name} - kein gültiges Bild`);
          continue;
        }

        // KI-Analyse mit detailliertem Logging
        console.log(`Starte KI-Analyse für ${downloadResult.filename}...`);
        const aiAnalysis = await analyzeImageWithAI({ buffer: downloadResult.buffer, filename: downloadResult.filename }, true, `https://drive.google.com/file/d/${file.id}/view`);
        console.log(`KI-Analyse abgeschlossen:`);
        console.log(`  Titel: "${aiAnalysis.title}"`);
        console.log(`  Beschreibung: "${aiAnalysis.description}"`);
        
        // Bild optimieren
        const optimizedBuffer = await optimizeImage(downloadResult.buffer);
        
        // Thumbnail erstellen
        const tempPath = path.join(__dirname, 'temp_images', `drive-${i + 1}.jpg`);
        fs.writeFileSync(tempPath, optimizedBuffer);
        
        const processedImage = {
          filename: file.name,
          title: aiAnalysis.title,
          description: aiAnalysis.description,
          thumbnailUrl: `/temp_images/drive-${i + 1}.jpg`,
          originalUrl: `https://drive.google.com/file/d/${file.id}/view`,
          lineNumber: i + 1,
          copyright: null,
          isValidImage: true,
          analysisStatus: 'success',
          analysisMessage: 'KI-Analyse erfolgreich'
        };

        processedImages.push(processedImage);
        console.log(`✅ Bild ${i + 1} erfolgreich verarbeitet: ${file.name}`);

      } catch (error) {
        console.error(`❌ Fehler bei Bild ${i + 1}:`, error.message);
      }
    }

    console.log(`Ordner-Verarbeitung abgeschlossen: ${processedImages.length} Bilder erfolgreich`);
    return processedImages;

  } catch (error) {
    console.error('Fehler bei der Ordner-Verarbeitung:', error);
    throw error;
  }
}

// Verarbeitung hochgeladener Bilder
app.post('/api/process-uploaded-images', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Keine Bilder hochgeladen'
      });
    }

    console.log(`Verarbeite ${req.files.length} hochgeladene Bilder...`);
    
    const processedImages = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      console.log(`Verarbeite Bild ${i + 1}/${req.files.length}: ${file.originalname}`);
      
      try {
        // Prüfe ob es ein gültiges Bild ist
        const imageBuffer = file.buffer;
        const isValidImage = await detectImageFormat(imageBuffer);
        
        if (!isValidImage) {
          console.log(`Überspringe ${file.originalname} - kein gültiges Bild`);
          continue;
        }

        // Speichere temporär für KI-Analyse
        const tempPath = path.join(__dirname, 'temp_images', `upload-${i + 1}.jpg`);
        fs.writeFileSync(tempPath, imageBuffer);
        
        // KI-Analyse mit detailliertem Logging
        console.log(`Starte KI-Analyse für ${file.originalname}...`);
        const aiAnalysis = await analyzeImageWithAI(tempPath, true, `uploaded-${file.originalname}`);
        console.log(`KI-Analyse abgeschlossen:`);
        console.log(`  Titel: "${aiAnalysis.title}"`);
        console.log(`  Beschreibung: "${aiAnalysis.description}"`);
        
        // Bild optimieren
        const optimizedBuffer = await optimizeImage(imageBuffer);
        
        // Thumbnail erstellen
        const thumbnailPath = path.join(__dirname, 'temp_images', `preview-upload-${i + 1}.jpg`);
        fs.writeFileSync(thumbnailPath, optimizedBuffer);
        
        // Speichere auch das optimierte Bild für Contentful Upload
        const uploadPath = path.join(__dirname, 'temp_images', `upload-${i + 1}.jpg`);
        fs.writeFileSync(uploadPath, optimizedBuffer);
        
        const processedImage = {
          filename: file.originalname,
          title: aiAnalysis.title,
          description: aiAnalysis.description,
          thumbnailUrl: `/temp_images/preview-upload-${i + 1}.jpg`,
          originalUrl: `/temp_images/upload-${i + 1}.jpg`,
          lineNumber: i + 1,
          copyright: '', // Leeres Copyright-Feld für manuelle Eingabe
          isValidImage: true,
          analysisStatus: 'success',
          analysisMessage: 'KI-Analyse erfolgreich',
          uploadStatus: 'pending',
          uploadMessage: 'Bereit zum Hochladen',
          aiAnalysis: aiAnalysis // Speichere die komplette KI-Analyse
        };

        processedImages.push(processedImage);
        console.log(`✅ Bild ${i + 1} erfolgreich verarbeitet: ${file.originalname}`);

      } catch (error) {
        console.error(`❌ Fehler bei Bild ${i + 1}:`, error.message);
      }
    }

    console.log(`Bildverarbeitung abgeschlossen: ${processedImages.length} Bilder erfolgreich`);
    
    res.json({
      success: true,
      data: {
        processedImages: processedImages
      }
    });

  } catch (error) {
    console.error('Fehler bei der Bildverarbeitung:', error);
    res.status(500).json({
      success: false,
      error: `Server-Fehler: ${error.message}`
    });
  }
});

// Neue robuste Bildverarbeitung für Bulk-Upload (basiert auf Briefing-Importer Logik)
app.post('/api/process-bulk-images', imageUpload.array('images', 10), async (req, res) => {
  try {
    console.log('🖼️ Starte neue robuste Bildverarbeitung für Bulk-Upload...');

    // Contentful Environment initialisieren
    const client = contentful.createClient({
      accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
    const environment = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT_ID || 'master');

    const files = req.files || [];
    const driveFolderUrl = req.body.driveFolderUrl;
    const processedImages = [];

    // Verarbeite hochgeladene Dateien (verwendet Briefing-Importer Logik)
    if (files.length > 0) {
      console.log(`📁 Verarbeite ${files.length} hochgeladene Dateien...`);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`Verarbeite Bild ${i + 1}/${files.length}: ${file.originalname}`);

        try {
          // Speichere die hochgeladene Datei lokal (wie im Briefing-Importer)
          const tempFilename = `upload-${Date.now()}-${i + 1}.jpg`;
          const tempPath = path.join(TEMP_IMAGES_DIR, tempFilename);
          fs.writeFileSync(tempPath, file.buffer);
          console.log(`Bild lokal gespeichert: ${tempPath}`);

          // Optimiere das Bild für Contentful (wie im Briefing-Importer)
          const optimizedBuffer = await optimizeImage(file.buffer, 2000);
          console.log(`Bild optimiert: ${optimizedBuffer.length} Bytes`);

          // Bild mit KI analysieren (verwendet Cache wie im Briefing-Importer)
          console.log(`Analysiere Bild mit KI...`);
          const aiAnalysis = await analyzeImageWithAI(
            { buffer: optimizedBuffer, filename: file.originalname },
            true,
            `uploaded-${file.originalname}`
          );
          console.log(`KI-Analyse abgeschlossen: ${aiAnalysis.title}`);

          // Speichere Vorschaubild für Frontend
          const previewFilename = `preview-upload-${i + 1}.jpg`;
          const previewPath = path.join(TEMP_IMAGES_DIR, previewFilename);
          fs.writeFileSync(previewPath, optimizedBuffer);
          console.log(`Vorschaubild erstellt: ${previewPath}`);

          // NICHT zu Contentful hochladen - nur KI-Analyse für Frontend bereitstellen
          console.log(`Bild ${i + 1} analysiert, warte auf Nutzer-Freigabe für Contentful-Upload...`);

          // Erstelle processedImage für Frontend (OHNE Contentful-Upload)
          const processedImage = {
            filename: file.originalname,
            title: aiAnalysis.title,
            description: aiAnalysis.description,
            thumbnailUrl: `/temp_images/${previewFilename}`,
            originalUrl: `/temp_images/${tempFilename}`,
            lineNumber: i + 1,
            copyright: '',
            isValidImage: true,
            analysisStatus: 'success',
            analysisMessage: 'KI-Analyse erfolgreich',
            uploadStatus: 'pending',
            uploadMessage: 'Wartet auf Nutzer-Freigabe',
            aiAnalysis: aiAnalysis
          };

          processedImages.push(processedImage);
          console.log(`✅ ProcessedImage für Frontend erstellt: ${aiAnalysis.title}`);

        } catch (error) {
          console.error(`❌ Fehler bei Bild ${i + 1}:`, error.message);

          // Fallback-Entry ohne Contentful-Upload
          const processedImage = {
            filename: file.originalname,
            title: file.originalname,
            description: `Beschreibung für ${file.originalname}`,
            thumbnailUrl: `/temp_images/error-${i + 1}.jpg`,
            originalUrl: `/temp_images/error-${i + 1}.jpg`,
            lineNumber: i + 1,
            copyright: '',
            isValidImage: false,
            analysisStatus: 'error',
            analysisMessage: `Fehler: ${error.message}`,
            uploadStatus: 'error',
            uploadMessage: 'Fehler beim Hochladen',
            error: error.message
          };

          processedImages.push(processedImage);
        }
      }
    }

    // Verarbeite Google Drive Ordner (verwendet Briefing-Importer Logik)
    if (driveFolderUrl) {
      console.log(`🔗 Verarbeite Google Drive Ordner: ${driveFolderUrl}`);

      try {
        const folderId = extractFolderIdFromUrl(driveFolderUrl);
        const driveImages = await processDriveFolder(folderId);

        for (let i = 0; i < driveImages.length; i++) {
          const driveImage = driveImages[i];
          console.log(`Verarbeite Drive-Bild ${i + 1}/${driveImages.length}: ${driveImage.filename}`);

          try {
            // Bild von verschiedenen Quellen herunterladen (wie im Briefing-Importer)
            const imageData = await downloadImageFromVariousSources(driveImage.originalUrl);
            console.log(`Drive-Bild erfolgreich lokal gespeichert: ${imageData.localPath} (${imageData.filename})`);

            // Bild mit KI analysieren (wie im Briefing-Importer)
            console.log(`Analysiere Drive-Bild mit KI...`);
            const aiAnalysis = await analyzeImageWithAI(
              { buffer: await readLocalImageForOpenAI(imageData.localPath), filename: imageData.filename },
              imageData.isValidImage,
              driveImage.originalUrl
            );
            console.log(`KI-Analyse abgeschlossen: ${aiAnalysis.title}`);

            // Lese das Bild für Contentful Upload (wie im Briefing-Importer)
            const imageBuffer = await readLocalImageForOpenAI(imageData.localPath);

            // Optimiere das Bild für Contentful (wie im Briefing-Importer)
            const optimizedBuffer = await optimizeImage(imageBuffer, 2000);

            // NICHT direkt hochladen - nur für Vorschau vorbereiten
            console.log(`✅ Drive-Bild für Vorschau vorbereitet: ${imageData.filename}`);

            const processedImage = {
              filename: imageData.filename,
              title: aiAnalysis.title,
              description: aiAnalysis.description,
              thumbnailUrl: `/temp_images/${imageData.filename}`, // Echter Dateiname für Drive-Bilder
              originalUrl: driveImage.originalUrl,
              lineNumber: processedImages.length + i + 1,
              copyright: driveImage.copyright || '',
              isValidImage: imageData.isValidImage,
              analysisStatus: 'success',
              analysisMessage: 'KI-Analyse erfolgreich',
              uploadStatus: 'pending',
              uploadMessage: 'Bereit für Upload zu Contentful',
              aiAnalysis: aiAnalysis,
              isFromDrive: true
            };

            processedImages.push(processedImage);

          } catch (error) {
            console.error(`❌ Fehler bei Drive-Bild ${i + 1}:`, error.message);

            // Fallback für fehlerhafte Bilder
            const processedImage = {
              filename: driveImage.filename,
              title: driveImage.title || driveImage.filename,
              description: driveImage.description || `Beschreibung für ${driveImage.filename}`,
              thumbnailUrl: `/temp_images/error-drive-${i + 1}.jpg`, // Error-Placeholder-Bild
              originalUrl: driveImage.originalUrl,
              lineNumber: processedImages.length + i + 1,
              copyright: driveImage.copyright || '',
              isValidImage: false,
              analysisStatus: 'error',
              analysisMessage: `Fehler: ${error.message}`,
              uploadStatus: 'error',
              uploadMessage: 'Fehler bei der Vorbereitung',
              error: error.message,
              isFromDrive: true
            };

            processedImages.push(processedImage);
          }
        }

      } catch (error) {
        console.error('❌ Fehler beim Verarbeiten des Google Drive Ordners:', error.message);
      }
    }

    // NICHT aufräumen - Vorschaubilder werden für Frontend benötigt
    console.log('Vorschaubilder bleiben für Frontend verfügbar...');

    console.log(`✅ Neue robuste Bildverarbeitung abgeschlossen: ${processedImages.length} Bilder verarbeitet`);

    res.json({
      success: true,
      data: {
        processedImages: processedImages,
        totalProcessed: processedImages.length,
        successfulUploads: processedImages.filter(img => img.uploadStatus === 'success').length,
        failedUploads: processedImages.filter(img => img.uploadStatus === 'error').length
      }
    });

  } catch (error) {
    console.error('❌ Fehler bei der neuen robusten Bildverarbeitung:', error);
    res.status(500).json({
      success: false,
      error: `Server-Fehler: ${error.message}`
    });
  }
});

// Hilfsfunktion zum Extrahieren der Folder-ID aus Google Drive URL
function extractFolderIdFromUrl(url) {
  const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (match) {
    return match[1];
  }
  throw new Error('Ungültige Google Drive Ordner-URL');
}

// Contentful Content-Types analysieren
app.get('/api/contentful-content-types', async (req, res) => {
  try {
    console.log('Analysiere Contentful Content-Types...');
    
    // Contentful Client initialisieren
    const client = contentful.createClient({
      accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    // Space und Environment abrufen
    const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
    const environment = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT_ID || 'master');

    // Alle Content-Types abrufen
    const contentTypes = await environment.getContentTypes();
    
    console.log(`Gefundene Content-Types: ${contentTypes.items.length}`);
    
    const contentTypeAnalysis = contentTypes.items.map(ct => ({
      id: ct.sys.id,
      name: ct.name,
      description: ct.description,
      fields: ct.fields.map(field => ({
        id: field.id,
        name: field.name,
        type: field.type,
        required: field.required,
        validations: field.validations
      }))
    }));

    console.log('Content-Type Details:');
    contentTypeAnalysis.forEach(ct => {
      console.log(`- ${ct.id} (${ct.name}): ${ct.fields.length} Felder`);
      ct.fields.forEach(field => {
        console.log(`  - ${field.id}: ${field.type} ${field.required ? '(required)' : '(optional)'}`);
      });
    });

    res.json({
      success: true,
      data: {
        totalContentTypes: contentTypes.items.length,
        contentTypes: contentTypeAnalysis
      }
    });

  } catch (error) {
    console.error('Fehler bei der Content-Type-Analyse:', error);
    res.status(500).json({
      success: false,
      error: `Server-Fehler: ${error.message}`
    });
  }
});

// ===== FUNKTIONEN AUS BRIEFING-IMPORTER.JS =====

// Hilfsfunktion zum Generieren des internen Namens aus dem Slug
function generateInternalName(slug) {
  return slug
    .split('/')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' > ');
}

// Hilfsfunktion zum Extrahieren der Inhalte vor und nach [Produkt]
function extractContent(briefingText) {
  // Prüfe ob [Produkt] Marker vorhanden ist
  if (briefingText.includes('[Produkt]')) {
    const parts = briefingText.split('[Produkt]');
    return {
      beforeProduct: parts[0].trim(),
      afterProduct: parts[1] ? parts[1].trim() : ''
    };
  } else {
    // Wenn kein [Produkt] Marker vorhanden ist, teile den Content in Intro und Hauptinhalt
    const lines = briefingText.split('\n');
    const introLines = [];
    const mainContentLines = [];
    let isIntro = true;
    
    for (const line of lines) {
      // Wenn wir auf FAQ-Sektion stoßen, hören wir auf
      if (line.includes('Häufig gestellte Fragen')) {
        break;
      }
      
      // Erste 10 Zeilen oder bis zur ersten H2-Überschrift sind Intro
      if (isIntro && (introLines.length < 10 || !line.startsWith('H2:'))) {
        introLines.push(line);
      } else {
        isIntro = false;
        mainContentLines.push(line);
      }
    }
    
    return {
      beforeProduct: introLines.join('\n').trim(),
      afterProduct: mainContentLines.join('\n').trim()
    };
  }
}

// Neue Hilfsfunktion zum Erkennen und Extrahieren von FAQs
function extractFAQs(content) {
  const faqs = [];
  const lines = content.split('\n');
  let isFAQSection = false;
  let currentFAQ = null;
  let faqStartIndex = -1;

  // Finde den Start der FAQ-Sektion
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Häufig gestellte Fragen')) {
      faqStartIndex = i;
      break;
    }
  }

  // Wenn FAQ-Sektion gefunden wurde
  if (faqStartIndex !== -1) {
    for (let i = faqStartIndex; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('H3:')) {
        if (currentFAQ) {
          faqs.push(currentFAQ);
        }
        currentFAQ = {
          question: line.replace('H3:', '').trim(),
          answer: ''
        };
      } else if (currentFAQ && line.trim() !== '') {
        currentFAQ.answer += line.trim() + ' ';
      }
    }

    // Letztes FAQ hinzufügen
    if (currentFAQ) {
      faqs.push(currentFAQ);
    }
  }

  console.log(`FAQ-Extraktion: ${faqs.length} FAQs gefunden`);
  return faqs;
}

// Neue Hilfsfunktion zum Bereinigen des Contents von FAQs und Copyright-Hinweisen
function cleanContentFromFAQs(content) {
  const lines = content.split('\n');
  const cleanedLines = [];
  let isFAQSection = false;

  for (const line of lines) {
    // Prüfe auf Start der FAQ-Sektion
    if (line.includes('Häufig gestellte Fragen')) {
      isFAQSection = true;
      continue; // Überspringe die FAQ-Sektion
    }

    // Wenn wir nicht in der FAQ-Sektion sind, behalte die Zeile
    if (!isFAQSection) {
      // Entferne Copyright-Hinweise in Klammern am Ende der Zeile
      const cleanedLine = line.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (cleanedLine) {
        cleanedLines.push(cleanedLine);
      }
    }
  }

  const cleanedContent = cleanedLines.join('\n').trim();
  console.log(`Content bereinigt: ${cleanedContent.length} Zeichen übrig`);
  return cleanedContent;
}

// Neue Hilfsfunktion zum Erstellen von Bild-Text-Elementen mit CTA
async function createImageTextWithCTA(environment, imageAsset, textContent, ctaText, ctaLink, internalName, isHighlighted = false) {
  try {
    console.log(`Erstelle Bild-Text-Element mit CTA: ${internalName}`);
    
    // Bestimme den Content-Type basierend auf isHighlighted
    // Verwende die korrekten Content-Type-Namen aus Contentful
    const contentType = isHighlighted ? 'highlightedImageText' : 'simpleImageText';
    
    console.log(`Verwende Content-Type: ${contentType}`);
    
    // Erstelle das Bild-Text-Element
    const imageTextEntry = await environment.createEntry(contentType, {
      fields: {
        internerName: {
          'de-DE': internalName
        },
        image: {
          'de-DE': {
            sys: {
              type: 'Link',
              linkType: 'Asset',
              id: imageAsset.sys.id
            }
          }
        },
        text: {
          'de-DE': {
            nodeType: 'document',
            data: {},
            content: [
              {
                nodeType: 'paragraph',
                content: [
                  {
                    nodeType: 'text',
                    value: textContent,
                    marks: [],
                    data: {}
                  }
                ],
                data: {}
              }
            ]
          }
        }
      }
    });
    
    console.log(`${contentType} Entry erstellt: ${imageTextEntry.sys.id}`);
    
    // Erstelle CTA-Element, falls CTA-Text vorhanden
    let ctaEntry = null;
    if (ctaText && ctaLink) {
      console.log('Erstelle CTA-Element...');
      ctaEntry = await environment.createEntry('callToAction', {
        fields: {
          internerName: {
            'de-DE': `${internalName} - CTA`
          },
          title: {
            'de-DE': ctaText
          },
          link: {
            'de-DE': ctaLink
          }
        }
      });
      
      console.log(`CTA Entry erstellt: ${ctaEntry.sys.id}`);
    }
    
    // Veröffentliche beide Entries
    await imageTextEntry.publish();
    if (ctaEntry) {
      await ctaEntry.publish();
    }
    
    return {
      imageTextEntry,
      ctaEntry
    };
  } catch (error) {
    console.error('Fehler beim Erstellen von Bild-Text-Element mit CTA:', error);
    throw error;
  }
}

// Neue Hilfsfunktion zum Erkennen von CTA-Texten im Content
function extractCTAText(content) {
  const ctaPatterns = [
    /(?:CTA|Call to Action|Button):\s*(.+?)(?:\n|$)/gi,
    /(?:Link|URL):\s*(.+?)(?:\n|$)/gi,
    /(?:Mehr erfahren|Jetzt kaufen|Kontakt aufnehmen):\s*(.+?)(?:\n|$)/gi
  ];
  
  for (const pattern of ctaPatterns) {
    const match = content.match(pattern);
    if (match) {
      return {
        text: match[1].trim(),
        link: extractLinkFromText(match[1])
      };
    }
  }
  
  return null;
}

// Hilfsfunktion zum Extrahieren von Links aus Text
function extractLinkFromText(text) {
  const urlPattern = /(https?:\/\/[^\s]+)/i;
  const match = text.match(urlPattern);
  return match ? match[1] : '#';
}

// Neue Hilfsfunktion zum Erstellen von Bild-Text-Kombinationen aus Briefing
async function createImageTextCombinations(environment, imageEntries, content, internalName) {
  const combinations = [];
  
  // Extrahiere Bildlinks aus dem Content
  const imageLinks = extractImageLinks(content);
  console.log(`Gefundene Bildlinks: ${imageLinks.length}`);
  
  // Teile Content in Abschnitte auf
  const sections = content.split('\n\n');
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    
    // Suche nach Bildreferenzen in diesem Abschnitt
    const imageRefs = section.match(/Bildlink:\s*(.+)/g);
    
    if (imageRefs && imageRefs.length > 0) {
      for (const imageRef of imageRefs) {
        const imageUrl = imageRef.replace(/Bildlink:\s*/, '').trim();
        
        // Versuche das Asset direkt zu finden
        let asset = null;
        
        // Methode 1: Suche in imageEntries (falls vorhanden)
        if (imageEntries && imageEntries.length > 0) {
          const imageEntry = imageEntries.find(entry => 
            entry && entry.sys && entry.fields?.image?.['de-DE']?.sys?.id
          );
          if (imageEntry) {
            const assetId = imageEntry.fields.image['de-DE'].sys.id;
            try {
              asset = await environment.getAsset(assetId);
            } catch (error) {
              console.log(`Asset nicht gefunden für ID: ${assetId}`);
            }
          }
        }
        
        // Methode 2: Suche in allen Assets nach dem Dateinamen
        if (!asset) {
          try {
            const assets = await environment.getAssets();
            const filename = imageUrl.split('/').pop().split('?')[0];
            
            asset = assets.items.find(a => 
              a.fields?.title?.['de-DE']?.includes(filename) ||
              a.fields?.description?.['de-DE']?.includes(filename) ||
              a.fields?.file?.['de-DE']?.fileName?.includes(filename)
            );
            
            if (asset) {
              console.log(`Asset gefunden für ${filename}: ${asset.sys.id}`);
            }
          } catch (error) {
            console.error('Fehler beim Suchen nach Assets:', error);
          }
        }
        
        if (asset) {
          // Extrahiere Text ohne Bildlink
          const textContent = section.replace(/Bildlink:\s*.+/g, '').trim();
          
          // Extrahiere CTA
          const ctaInfo = extractCTAText(textContent);
          const cleanText = textContent.replace(/(?:CTA|Call to Action|Button|Link|URL):\s*.+/gi, '').trim();
          
          if (cleanText) {
            console.log(`Erstelle Bild-Text-Kombination für Abschnitt ${i + 1}...`);
            
            try {
              // Erstelle Bild-Text-Element
              const combination = await createImageTextWithCTA(
                environment,
                asset,
                cleanText,
                ctaInfo?.text,
                ctaInfo?.link,
                `${internalName} - Bild-Text ${i + 1}`,
                i === 0 // Erstes Element als hervorgehoben
              );
              
              combinations.push(combination);
              console.log(`Bild-Text-Kombination ${i + 1} erstellt`);
            } catch (error) {
              console.error(`Fehler beim Erstellen der Bild-Text-Kombination ${i + 1}:`, error);
            }
          }
        } else {
          console.log(`Kein Asset gefunden für Bildlink: ${imageUrl}`);
        }
      }
    }
  }
  
  return combinations;
}

// Neue Hilfsfunktion zum Erstellen eines FAQ-Accordions
async function createFAQAccordion(environment, faqs, internalName) {
    console.log('\nErstelle FAQ Accordion...');
    
    // Erstelle zuerst alle FAQ-Elemente
    const faqElements = [];
    for (let i = 0; i < faqs.length; i++) {
        const faq = faqs[i];
        try {
            const accordionElement = await environment.createEntry('accordionElement', {
                fields: {
                    internerName: { 'de-DE': `${internalName} - FAQ ${i + 1}` },
                    title: { 'de-DE': faq.question },
                    text: { 'de-DE': {
                        nodeType: 'document',
                        data: {},
                        content: [
                            {
                                nodeType: 'paragraph',
                                content: [
                                    {
                                        nodeType: 'text',
                                        value: faq.answer,
                                        marks: [],
                                        data: {}
                                    }
                                ],
                                data: {}
                            }
                        ]
                    }}
                }
            });
            try {
              await accordionElement.publish();
              console.log(`Accordion-Element ${i + 1} erstellt und veröffentlicht`);
              faqElements.push({ sys: { type: 'Link', linkType: 'Entry', id: accordionElement.sys.id } });
            } catch (publishError) {
              if (publishError.message && publishError.message.includes('VersionMismatch') || 
                  (publishError.status === 409 && publishError.statusText === 'Conflict')) {
                console.log(`Version-Konflikt beim Accordion Element ${accordionElement.sys.id}, hole aktuelle Version...`);
                
                try {
                  // Hole das Entry erneut mit aktueller Version
                  const freshEntry = await environment.getEntry(accordionElement.sys.id);
                  console.log(`Aktuelle Entry-Version geholt: ${freshEntry.sys.version}`);
                  
                  // Versuche erneut zu publishen
                  await freshEntry.publish();
                  console.log(`Accordion Element erfolgreich veröffentlicht mit aktueller Version: ${accordionElement.sys.id}`);
                  faqElements.push({ sys: { type: 'Link', linkType: 'Entry', id: freshEntry.sys.id } });
                } catch (retryError) {
                  console.log(`Erneuter Publish-Versuch fehlgeschlagen, verwende Entry ohne Veröffentlichung: ${accordionElement.sys.id}`);
                  console.log(`Accordion Element verfügbar (nicht veröffentlicht): ${accordionElement.sys.id}`);
                  faqElements.push({ sys: { type: 'Link', linkType: 'Entry', id: accordionElement.sys.id } });
                }
              } else {
                console.error('Unbekannter Publish-Fehler:', publishError.message);
                throw publishError;
              }
            }
        } catch (error) {
            if (error.message && error.message.includes('unique') && error.message.includes('Same field value present in other entry')) {
                console.log(`Ghost Entry erkannt für FAQ ${i + 1}, verwende Ghost Entry Logik...`);
                const entryIdMatch = error.message.match(/id":\s*"([^"]+)"/);
                if (entryIdMatch) {
                    const ghostEntryId = entryIdMatch[1];
                                    const ghostEntry = await fixGhostEntrySupportMethod(ghostEntryId, 'accordionElement');
                if (ghostEntry) {
                    faqElements.push({ sys: { type: 'Link', linkType: 'Entry', id: ghostEntry.sys.id } });
                    console.log(`Ghost Entry für FAQ ${i + 1} behandelt: ${ghostEntry.sys.id}`);
                } else {
                    console.error(`Ghost Entry Behandlung für FAQ ${i + 1} fehlgeschlagen`);
                    console.log(`⚠️  Überspringe FAQ ${i + 1} aufgrund fehlgeschlagener Ghost Entry Behandlung`);
                    // Überspringe diesen FAQ-Eintrag
                    continue;
                }
                } else {
                    console.error('Konnte Ghost Entry ID nicht extrahieren');
                    throw error;
                }
            } else {
                throw error;
            }
        }
    }
    
    // Erstelle dann das Haupt-Accordion mit allen FAQ-Elementen
    console.log('\nErstelle Haupt-Accordion mit allen FAQ-Elementen...');
    try {
        const accordionEntry = await environment.createEntry('accordion', {
            fields: {
                internerName: {
                    'de-DE': `${internalName} - FAQ Accordion`
                },
                accordionElements: {
                    'de-DE': faqElements
                }
            }
        });
        
        try {
          await accordionEntry.publish();
          console.log('FAQ Accordion erstellt und veröffentlicht');
          return accordionEntry;
        } catch (publishError) {
          if (publishError.message && publishError.message.includes('VersionMismatch') || 
              (publishError.status === 409 && publishError.statusText === 'Conflict')) {
            console.log(`Version-Konflikt beim FAQ Accordion Entry ${accordionEntry.sys.id}, hole aktuelle Version...`);
            
            try {
              // Hole das Entry erneut mit aktueller Version
              const freshEntry = await environment.getEntry(accordionEntry.sys.id);
              console.log(`Aktuelle Entry-Version geholt: ${freshEntry.sys.version}`);
              
              // Versuche erneut zu publishen
              await freshEntry.publish();
              console.log(`FAQ Accordion erfolgreich veröffentlicht mit aktueller Version: ${accordionEntry.sys.id}`);
              return freshEntry;
            } catch (retryError) {
              console.log(`Erneuter Publish-Versuch fehlgeschlagen, verwende Entry ohne Veröffentlichung: ${accordionEntry.sys.id}`);
              console.log(`FAQ Accordion Entry verfügbar (nicht veröffentlicht): ${accordionEntry.sys.id}`);
              return accordionEntry;
            }
          } else {
            console.error('Unbekannter Publish-Fehler:', publishError.message);
            throw publishError;
          }
        }
    } catch (error) {
        if (error.message && error.message.includes('unique') && error.message.includes('Same field value present in other entry')) {
            console.log(`Ghost Entry erkannt für ${internalName} - FAQ Accordion, verwende Ghost Entry Logik...`);
            const entryIdMatch = error.message.match(/id":\s*"([^"]+)"/);
            if (entryIdMatch) {
                            const ghostEntryId = entryIdMatch[1];
            const ghostEntry = await fixGhostEntrySupportMethod(ghostEntryId, 'accordion');
            if (ghostEntry) {
                return ghostEntry;
            } else {
                console.error('Ghost Entry Behandlung fehlgeschlagen');
                // Wenn Ghost Entry Behandlung fehlschlägt, überspringe diesen Entry
                console.log(`⚠️  Überspringe Entry aufgrund fehlgeschlagener Ghost Entry Behandlung`);
                return null;
            }
            } else {
                console.error('Konnte Ghost Entry ID nicht extrahieren');
                throw error;
            }
        } else {
            throw error;
        }
    }
}

// Verbesserte Rich-Text-Verarbeitung mit korrekter Strukturierung
function parseContentToRichText(content) {
  const lines = content.split('\n');
  const richTextContent = [];
  let currentParagraph = [];
  let currentList = [];
  let inList = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Überspringe leere Zeilen und Meta-Informationen
    if (trimmedLine === '' || 
        trimmedLine.startsWith('Slug:') || 
        trimmedLine.startsWith('local:') || 
        trimmedLine.startsWith('MT:') || 
        trimmedLine.startsWith('MD:') ||
        trimmedLine.startsWith('Bildlink:') ||
        trimmedLine.startsWith('CTA:') ||
        trimmedLine.startsWith('CTA-Vorschlag:') ||
        trimmedLine.startsWith('[FAQ]') ||
        trimmedLine.startsWith('[FAQ ende]')) {
      continue;
    }

    // Prüfe auf Listen-Elemente (Asterisk am Anfang)
    if (trimmedLine.startsWith('*')) {
      // Wenn wir nicht in einer Liste sind, speichere vorherigen Absatz
      if (!inList && currentParagraph.length > 0) {
        richTextContent.push({
          nodeType: 'paragraph',
          content: [
            {
              nodeType: 'text',
              value: currentParagraph.join(' '),
              marks: [],
              data: {}
            }
          ],
          data: {}
        });
        currentParagraph = [];
      }
      
      // Starte oder setze Liste fort
      inList = true;
      const listItemText = trimmedLine.replace(/^\*\s*/, '').trim();
      if (listItemText) {
        currentList.push({
          nodeType: 'list-item',
          content: [
            {
              nodeType: 'paragraph',
              content: [
                {
                  nodeType: 'text',
                  value: listItemText,
                  marks: [],
                  data: {}
                }
              ],
              data: {}
            }
          ],
          data: {}
        });
      }
      continue;
    }

    // Wenn wir in einer Liste sind und eine normale Zeile kommt, beende die Liste
    if (inList && !trimmedLine.startsWith('*')) {
      if (currentList.length > 0) {
        richTextContent.push({
          nodeType: 'unordered-list',
          content: currentList,
          data: {}
        });
        currentList = [];
      }
      inList = false;
    }

    // Überschriften verarbeiten
    if (trimmedLine.startsWith('H1:')) {
      // Vorherigen Absatz speichern
      if (currentParagraph.length > 0) {
        richTextContent.push({
          nodeType: 'paragraph',
          content: [
            {
              nodeType: 'text',
              value: currentParagraph.join(' '),
              marks: [],
              data: {}
            }
          ],
          data: {}
        });
        currentParagraph = [];
      }
      
      // H1 Überschrift hinzufügen
      richTextContent.push({
        nodeType: 'heading-1',
        content: [
          {
            nodeType: 'text',
            value: trimmedLine.replace('H1:', '').trim(),
            marks: [],
            data: {}
          }
        ],
        data: {}
      });
    } else if (trimmedLine.startsWith('H2:')) {
      // Vorherigen Absatz speichern
      if (currentParagraph.length > 0) {
        richTextContent.push({
          nodeType: 'paragraph',
          content: [
            {
              nodeType: 'text',
              value: currentParagraph.join(' '),
              marks: [],
              data: {}
            }
          ],
          data: {}
        });
        currentParagraph = [];
      }
      
      // H2 Überschrift hinzufügen
      richTextContent.push({
        nodeType: 'heading-2',
        content: [
          {
            nodeType: 'text',
            value: trimmedLine.replace('H2:', '').trim(),
            marks: [],
            data: {}
          }
        ],
        data: {}
      });
    } else if (trimmedLine.startsWith('H3:')) {
      // Vorherigen Absatz speichern
      if (currentParagraph.length > 0) {
        richTextContent.push({
          nodeType: 'paragraph',
          content: [
            {
              nodeType: 'text',
              value: currentParagraph.join(' '),
              marks: [],
              data: {}
            }
          ],
          data: {}
        });
        currentParagraph = [];
      }
      
      // H3 Überschrift hinzufügen
      richTextContent.push({
        nodeType: 'heading-3',
        content: [
          {
            nodeType: 'text',
            value: trimmedLine.replace('H3:', '').trim(),
            marks: [],
            data: {}
          }
        ],
        data: {}
      });
    } else if (!inList) {
      // Normaler Text zum aktuellen Absatz hinzufügen (nur wenn nicht in Liste)
      currentParagraph.push(trimmedLine);
    }
  }

  // Letzte Liste speichern
  if (inList && currentList.length > 0) {
    richTextContent.push({
      nodeType: 'unordered-list',
      content: currentList,
      data: {}
    });
  }

  // Letzten Absatz speichern
  if (currentParagraph.length > 0) {
    richTextContent.push({
      nodeType: 'paragraph',
      content: [
        {
          nodeType: 'text',
          value: currentParagraph.join(' '),
          marks: [],
          data: {}
        }
      ],
      data: {}
    });
  }

  return richTextContent;
}

async function createRichTextSegments(environment, content, internalName) {
    console.log('\nStarte strukturierte Rich Text Erstellung...');
    
    // Extrahiere den Inhalt vor und nach [Produkt]
    const extractedContent = extractContent(content);
    
    // Erstelle RichText-Einträge für jeden Abschnitt
    const segments = [];
    
    // Erstelle RichText für den Inhalt vor [Produkt]
    if (extractedContent.beforeProduct.trim()) {
        console.log('Erstelle Intro-RichText...');
        const beforeProductEntry = await createRichText(
            environment,
            extractedContent.beforeProduct,
            `${internalName} - Intro`
        );
        if (beforeProductEntry) {
            segments.push(beforeProductEntry);
        }
    }
    
    // Erstelle RichText für den Inhalt nach [Produkt]
    if (extractedContent.afterProduct.trim()) {
        console.log('Erstelle Hauptinhalt-RichText...');
        const afterProductEntry = await createRichText(
            environment,
            extractedContent.afterProduct,
            `${internalName} - Hauptinhalt`
        );
        if (afterProductEntry) {
            segments.push(afterProductEntry);
        }
    }
    
    console.log(`✅ ${segments.length} Rich-Text-Segmente erstellt`);
    return segments;
}

async function createPage(environment, pageData, richTextSegments, faqAccordion, imageTextCombinations = []) {
    console.log('\nErstelle Seite...');
    
    // Filtere null-Einträge aus den RichText-Segmenten
    const validSegments = richTextSegments.filter(segment => segment !== null);
    
    const contentLinks = [
        ...validSegments.map(entry => ({
            sys: {
                type: 'Link',
                linkType: 'Entry',
                id: entry.sys.id
            }
        }))
    ];
    
    // Füge Bild-Text-Kombinationen hinzu
    if (imageTextCombinations && imageTextCombinations.length > 0) {
        console.log(`Füge ${imageTextCombinations.length} Bild-Text-Kombinationen zur Seite hinzu...`);
        for (const combination of imageTextCombinations) {
            if (combination.imageTextEntry) {
                contentLinks.push({
                    sys: {
                        type: 'Link',
                        linkType: 'Entry',
                        id: combination.imageTextEntry.sys.id
                    }
                });
            }
            if (combination.ctaEntry) {
                contentLinks.push({
                    sys: {
                        type: 'Link',
                        linkType: 'Entry',
                        id: combination.ctaEntry.sys.id
                    }
                });
            }
        }
    }
    
    // Füge FAQ-Accordion hinzu, falls vorhanden
    if (faqAccordion) {
        contentLinks.push({
            sys: {
                type: 'Link',
                linkType: 'Entry',
                id: faqAccordion.sys.id
            }
        });
    }
    
    try {
        const page = await environment.createEntry('pageStandard', {
            fields: {
                slug: {
                    'de-DE': pageData.slug
                },
                internerName: {
                    'de-DE': pageData.internalName
                },
                metaPageTitle: {
                    'de-DE': pageData.metaTitle
                },
                metaDescription: {
                    'de-DE': pageData.metaDescription
                },
                content: {
                    'de-DE': contentLinks
                },
                isNoIndex: {
                    'de-DE': false
                },
                isDisabledForLocale: {
                    'de-DE': false
                }
            }
        });
        
        try {
          await page.publish();
          console.log('Seite erstellt und veröffentlicht');
          return page;
        } catch (publishError) {
          if (publishError.message && publishError.message.includes('VersionMismatch') || 
              (publishError.status === 409 && publishError.statusText === 'Conflict')) {
            console.log(`Version-Konflikt beim Page Entry ${page.sys.id}, hole aktuelle Version...`);
            
            try {
              // Hole das Entry erneut mit aktueller Version
              const freshEntry = await environment.getEntry(page.sys.id);
              console.log(`Aktuelle Entry-Version geholt: ${freshEntry.sys.version}`);
              
              // Versuche erneut zu publishen
              await freshEntry.publish();
              console.log(`Page erfolgreich veröffentlicht mit aktueller Version: ${page.sys.id}`);
              return freshEntry;
            } catch (retryError) {
              console.log(`Erneuter Publish-Versuch fehlgeschlagen, verwende Entry ohne Veröffentlichung: ${page.sys.id}`);
              console.log(`Page Entry verfügbar (nicht veröffentlicht): ${page.sys.id}`);
              return page;
            }
          } else {
            console.error('Unbekannter Publish-Fehler:', publishError.message);
            throw publishError;
          }
        }
    } catch (error) {
        if (error.message && error.message.includes('unique') && error.message.includes('Same field value present in other entry')) {
            console.log(`Ghost Entry erkannt für ${pageData.internalName}, verwende Ghost Entry Logik...`);
            const entryIdMatch = error.message.match(/id":\s*"([^"]+)"/);
            if (entryIdMatch) {
                      const ghostEntryId = entryIdMatch[1];
      const ghostEntry = await fixGhostEntrySupportMethod(ghostEntryId, 'pageStandard');
      if (ghostEntry) {
          return ghostEntry;
      } else {
          console.error('Ghost Entry Behandlung fehlgeschlagen');
          // Wenn Ghost Entry Behandlung fehlschlägt, überspringe diesen Entry
          console.log(`⚠️  Überspringe Entry aufgrund fehlgeschlagener Ghost Entry Behandlung`);
          return null;
      }
            } else {
                console.error('Konnte Ghost Entry ID nicht extrahieren');
                throw error;
            }
        } else {
            throw error;
        }
    }
}

function toRichTextDocument(contentNodes) {
    return {
        nodeType: 'document',
        data: {},
        content: Array.isArray(contentNodes) ? contentNodes : []
    };
}

async function createRichText(environment, content, internalName) {
    // Prüfe, ob der Inhalt leer ist (nach Entfernen von Whitespace)
    if (!content || !content.trim()) {
        console.log(`Überspringe leeren Abschnitt: ${internalName}`);
        return null;
    }
    console.log('Erstelle Rich Text Entry...');
    const richTextContent = parseContentToRichText(content);
    
    try {
        const entry = await environment.createEntry('richText', {
            fields: {
                internerName: {
                    'de-DE': internalName
                },
                richtext: {
                    'de-DE': toRichTextDocument(richTextContent)
                },
                alignment: {
                    'de-DE': '⬅️~Links'
                },
                isDark: {
                    'de-DE': false
                },
                decorativeElement: {
                    'de-DE': '🚫~keins'
                },
                isDisabledForLocale: {
                    'de-DE': false
                }
            }
        });
        console.log('Rich Text Entry erstellt:', entry.sys.id);
        
        console.log('Veröffentliche Rich Text...');
        try {
          await entry.publish();
          console.log('Rich Text veröffentlicht:', entry.sys.id);
          return entry;
        } catch (publishError) {
          if (publishError.message && publishError.message.includes('VersionMismatch') || 
              (publishError.status === 409 && publishError.statusText === 'Conflict')) {
            console.log(`Version-Konflikt beim Rich Text Entry ${entry.sys.id}, hole aktuelle Version...`);
            
            try {
              // Hole das Entry erneut mit aktueller Version
              const freshEntry = await environment.getEntry(entry.sys.id);
              console.log(`Aktuelle Entry-Version geholt: ${freshEntry.sys.version}`);
              
              // Versuche erneut zu publishen
              await freshEntry.publish();
              console.log(`Rich Text erfolgreich veröffentlicht mit aktueller Version: ${entry.sys.id}`);
              return freshEntry;
            } catch (retryError) {
              console.log(`Erneuter Publish-Versuch fehlgeschlagen, verwende Entry ohne Veröffentlichung: ${entry.sys.id}`);
              console.log(`Rich Text Entry verfügbar (nicht veröffentlicht): ${entry.sys.id}`);
              return entry;
            }
          } else {
            console.error('Unbekannter Publish-Fehler:', publishError.message);
            throw publishError;
          }
        }
    } catch (error) {
        if (error.message && error.message.includes('unique') && error.message.includes('Same field value present in other entry')) {
            console.log(`Ghost Entry erkannt für ${internalName}, verwende Ghost Entry Logik...`);
            // Extrahiere die Entry-ID aus der Fehlermeldung
            const entryIdMatch = error.message.match(/id":\s*"([^"]+)"/);
            if (entryIdMatch) {
                const ghostEntryId = entryIdMatch[1];
                const ghostEntry = await fixGhostEntrySupportMethod(ghostEntryId, 'richText');
                if (ghostEntry) {
                    console.log(`✅ Ghost Entry erfolgreich behandelt: ${ghostEntryId}`);
                    return ghostEntry;
                } else {
                    console.error('Ghost Entry Behandlung fehlgeschlagen');
                    // Wenn Ghost Entry Behandlung fehlschlägt, erstelle einen neuen Entry mit eindeutigem Namen
                    console.log(`⚠️  Erstelle neuen Entry mit eindeutigem Namen`);
                    const uniqueName = `${internalName}_${Date.now()}`;
                    console.log(`Erstelle neuen Entry: ${uniqueName}`);
                    
                    // Erstelle den neuen Entry direkt ohne rekursiven Aufruf
                    const newEntry = await environment.createEntry('richText', {
                        fields: {
                            internerName: {
                                'de-DE': uniqueName
                            },
                            richtext: {
                                'de-DE': toRichTextDocument(richTextContent)
                            },
                            alignment: {
                                'de-DE': '⬅️~Links'
                            },
                            isDark: {
                                'de-DE': false
                            },
                            decorativeElement: {
                                'de-DE': '🚫~keins'
                            },
                            isDisabledForLocale: {
                                'de-DE': false
                            }
                        }
                    });
                    
                    try {
                        await newEntry.publish();
                        console.log(`Neuer Rich Text Entry erstellt und veröffentlicht: ${newEntry.sys.id}`);
                        return newEntry;
                    } catch (publishError) {
                        console.log(`Neuer Rich Text Entry erstellt (nicht veröffentlicht): ${newEntry.sys.id}`);
                        return newEntry;
                    }
                }
            } else {
                console.error('Konnte Ghost Entry ID nicht extrahieren');
                throw error;
            }
        } else {
            throw error;
        }
    }
}

function extractPageData(content) {
    const slug = extractSlug(content);
    const internalName = generateInternalName(slug);
    const metaInfo = extractMetaInfo(content);
    const extractedContent = extractContent(content);
    
    return {
        slug,
        internalName,
        metaTitle: metaInfo.metaTitle,
        metaDescription: metaInfo.metaDescription,
        content: extractedContent.afterProduct
    };
}

// ===== ENDE FUNKTIONEN AUS BRIEFING-IMPORTER.JS =====

// Support-Verfahren für Ghost-Entry-Bereinigung
async function fixGhostEntrySupportMethod(ghostEntryId, contentType = 'pageStandard') {
  console.log(`🧹 Support-Verfahren für Ghost-Entry: ${ghostEntryId}`);
  
  try {
    const client = contentful.createClient({
      accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });
    
    const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
    const environment = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT_ID || 'master');
    
    // Versuche zuerst, den bestehenden Entry zu holen
    try {
      const existingEntry = await environment.getEntry(ghostEntryId);
      console.log(`✅ Bestehender Entry gefunden: ${ghostEntryId}`);
      console.log(`📋 Entry Status: ${existingEntry.sys.publishedVersion ? 'Published' : 'Draft'}`);
      
      // Prüfe, ob der Entry bereits publiziert ist
      if (existingEntry.sys.publishedVersion) {
        console.log(`✅ Entry bereits publiziert: ${ghostEntryId}`);
        return existingEntry;
      }
      
      // Versuche den Entry zu publishen
      try {
        await existingEntry.publish();
        console.log(`✅ Entry erfolgreich publiziert: ${ghostEntryId}`);
        return existingEntry;
      } catch (publishError) {
        console.log(`⚠️  Entry kann nicht publiziert werden: ${ghostEntryId}`);
        console.log(`📋 Publish-Fehler: ${publishError.message}`);
        // Gib trotzdem den Entry zurück, da er existiert
        return existingEntry;
      }
    } catch (getError) {
      console.log(`⚠️  Entry nicht gefunden: ${ghostEntryId}`);
      console.log(`📋 Get-Fehler: ${getError.message}`);
      // Wenn der Entry nicht existiert, können wir ihn nicht behandeln
      return null;
    }
    
  } catch (error) {
    console.error(`❌ Fehler beim Support-Verfahren:`, error.message);
    if (error.response) {
      console.error('📋 HTTP Status:', error.response.status);
      console.error('📋 Response:', error.response.data);
    }
    // Gib null zurück statt false, damit der Aufrufer weiß, dass es fehlgeschlagen ist
    return null;
  }
}

// Neue Funktion: Prüfe, ob bereits ein Entry mit dem gleichen internerName existiert
async function checkExistingEntryByName(environment, internalName, contentType = 'richText') {
  try {
    console.log(`🔍 Prüfe auf bestehenden Entry mit Namen: ${internalName}`);
    
    // Hole alle Entries des Content-Types
    const entries = await environment.getEntries({
      content_type: contentType,
      'fields.internerName[de-DE]': internalName,
      limit: 1
    });
    
    if (entries.items.length > 0) {
      const existingEntry = entries.items[0];
      console.log(`✅ Bestehender Entry gefunden: ${existingEntry.sys.id}`);
      console.log(`📋 Entry Status: ${existingEntry.sys.publishedVersion ? 'Published' : 'Draft'}`);
      return existingEntry;
    } else {
      console.log(`❌ Kein bestehender Entry gefunden für: ${internalName}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Fehler beim Prüfen auf bestehenden Entry:`, error.message);
    return null;
  }
}

// Hilfsfunktion zum Ermitteln der Content-Type-ID
async function getContentTypeId(environment, contentTypeName) {
  try {
    const contentType = await environment.getContentType(contentTypeName);
    return contentType.sys.id;
  } catch (error) {
    console.error(`Fehler beim Ermitteln der Content-Type-ID für ${contentTypeName}:`, error.message);
    const fallbackIds = {
      'pageStandard': 'pageStandard',
      'richText': 'richText', 
      'accordionElement': 'accordionElement',
      'accordion': 'accordion',
      'simpleImageText': 'simpleImageText',
      'highlightedImageText': 'highlightedImageText',
      'callToAction': 'callToAction'
    };
    return fallbackIds[contentTypeName] || contentTypeName;
  }
}

// Hilfsfunktion zum Auflisten aller verfügbaren Content-Types
async function listAvailableContentTypes(environment) {
  try {
    const contentTypes = await environment.getContentTypes();
    console.log('=== Verfügbare Content-Types ===');
    contentTypes.items.forEach(ct => {
      console.log(`- ${ct.sys.id}: ${ct.name}`);
    });
    console.log('=== Ende Content-Types ===');
    return contentTypes.items.map(ct => ct.sys.id);
  } catch (error) {
    console.error('Fehler beim Abrufen der Content-Types:', error);
    return [];
  }
}

// ===== ERWEITERTE UPLOAD-DEBUG-FUNKTIONEN =====

// Upload-Prozess Debug-Logging
function debugUploadStep(step, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🔍 UPLOAD-DEBUG [${step}]:`, data || '');
  
  // Speichere in Debug-Log-Datei
  const logPath = path.join(__dirname, 'upload-debug-logs.json');
  try {
    let logs = [];
    if (fs.existsSync(logPath)) {
      logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    }
    logs.push({
      timestamp,
      step,
      data: data ? JSON.stringify(data, null, 2) : null
    });
    
    // Behalte nur die letzten 1000 Einträge
    if (logs.length > 1000) {
      logs = logs.slice(-1000);
    }
    
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('Fehler beim Schreiben des Upload-Debug-Logs:', error.message);
  }
}

// Upload-Prozess Diagnose
async function diagnoseUploadProcess(briefingText) {
  debugUploadStep('START_DIAGNOSE', { briefingLength: briefingText.length });
  
  const diagnosis = {
    timestamp: new Date().toISOString(),
    briefingAnalysis: {},
    imageAnalysis: {},
    contentfulStatus: {},
    recommendations: []
  };
  
  try {
    // 1. Briefing-Analyse
    debugUploadStep('BRIEFING_ANALYSIS_START');
    const validation = validateBriefingFormat(briefingText);
    diagnosis.briefingAnalysis = {
      isValid: validation.isValid,
      errors: validation.errors,
      hasProductMarker: validation.hasProductMarker,
      slug: extractSlug(briefingText),
      metaInfo: extractMetaInfo(briefingText)
    };
    debugUploadStep('BRIEFING_ANALYSIS_COMPLETE', diagnosis.briefingAnalysis);
    
    if (!validation.isValid) {
      diagnosis.recommendations.push('Briefing-Format korrigieren');
    }
    
    // 2. Bildlink-Analyse
    debugUploadStep('IMAGE_LINK_ANALYSIS_START');
    const imageLinks = await extractImageLinks(briefingText);
    diagnosis.imageAnalysis = {
      totalLinks: imageLinks.length,
      googleDriveLinks: imageLinks.filter(link => link.url.includes('drive.google.com')).length,
      directLinks: imageLinks.filter(link => !link.url.includes('drive.google.com')).length,
      convertedLinks: imageLinks.filter(link => link.isConverted).length,
      links: imageLinks.map(link => ({
        url: link.url,
        originalUrl: link.originalUrl,
        lineNumber: link.lineNumber,
        isConverted: link.isConverted,
        copyright: link.copyright
      }))
    };
    debugUploadStep('IMAGE_LINK_ANALYSIS_COMPLETE', diagnosis.imageAnalysis);
    
    if (imageLinks.length === 0) {
      diagnosis.recommendations.push('Keine Bildlinks im Briefing gefunden');
    }
    
    // 3. Contentful-Status
    debugUploadStep('CONTENTFUL_STATUS_CHECK_START');
    const client = contentful.createClient({
      accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });
    
    try {
      const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
      const environment = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT_ID || 'master');
      
      diagnosis.contentfulStatus = {
        spaceConnected: true,
        spaceName: space.name,
        environmentConnected: true,
        environmentName: environment.name
      };
      debugUploadStep('CONTENTFUL_STATUS_CHECK_COMPLETE', diagnosis.contentfulStatus);
    } catch (error) {
      diagnosis.contentfulStatus = {
        spaceConnected: false,
        error: error.message
      };
      diagnosis.recommendations.push('Contentful-Verbindung prüfen');
      debugUploadStep('CONTENTFUL_STATUS_CHECK_FAILED', { error: error.message });
    }
    
    // 4. Content-Analyse
    debugUploadStep('CONTENT_ANALYSIS_START');
    const contentTypes = analyzeContentTypes(briefingText);
    diagnosis.contentAnalysis = {
      contentTypes: contentTypes,
      hasFAQs: briefingText.includes('Häufig gestellte Fragen'),
      hasProductMarker: briefingText.includes('[Produkt]'),
      contentLength: briefingText.length
    };
    debugUploadStep('CONTENT_ANALYSIS_COMPLETE', diagnosis.contentAnalysis);
    
    debugUploadStep('DIAGNOSE_COMPLETE', diagnosis);
    return diagnosis;
    
  } catch (error) {
    debugUploadStep('DIAGNOSE_ERROR', { error: error.message });
    diagnosis.error = error.message;
    return diagnosis;
  }
}

// Upload-Prozess Schritt-für-Schritt Überwachung
async function monitorUploadStep(stepName, stepFunction, context = {}) {
  debugUploadStep(`STEP_START_${stepName.toUpperCase()}`, context);
  
  try {
    const startTime = Date.now();
    const result = await stepFunction();
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    debugUploadStep(`STEP_SUCCESS_${stepName.toUpperCase()}`, {
      duration: `${duration}ms`,
      result: result
    });
    
    return result;
  } catch (error) {
    debugUploadStep(`STEP_ERROR_${stepName.toUpperCase()}`, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Upload-Debug-Logs abrufen
app.get('/api/debug/upload-logs', (req, res) => {
  try {
    const logPath = path.join(__dirname, 'upload-debug-logs.json');
    if (fs.existsSync(logPath)) {
      const logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      res.json({
        success: true,
        data: {
          logs: logs.slice(-100), // Letzte 100 Einträge
          totalLogs: logs.length
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          logs: [],
          totalLogs: 0
        }
      });
    }
  } catch (error) {
    console.error('Fehler beim Abrufen der Upload-Debug-Logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Upload-Diagnose durchführen
app.post('/api/debug/upload-diagnosis', upload.single('briefing'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Keine Datei hochgeladen'
      });
    }
    
    const briefingText = req.file.buffer ? req.file.buffer.toString('utf8') : fs.readFileSync(req.file.path, 'utf8');
    const diagnosis = await diagnoseUploadProcess(briefingText);
    
    res.json({
      success: true,
      data: diagnosis
    });
    
  } catch (error) {
    console.error('Fehler bei Upload-Diagnose:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Content-Type-Überprüfung
app.get('/api/debug/content-types', async (req, res) => {
  try {
    const client = contentful.createClient({
      accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });
    const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
    const environment = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT_ID || 'master');
    const contentTypes = await listAvailableContentTypes(environment);
    
    res.json({
      success: true,
      data: {
        contentTypes,
        message: 'Verfügbare Content-Types abgerufen'
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Content-Types:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Cache-Management-Endpunkte
app.get('/api/debug/image-cache', (req, res) => {
  try {
    const cacheData = {};
    for (const [key, value] of imageAnalysisCache.entries()) {
      cacheData[key] = value;
    }
    res.json({ 
      success: true, 
      data: { 
        cacheSize: imageAnalysisCache.size,
        cacheEntries: cacheData 
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/debug/image-cache', (req, res) => {
  try {
    imageAnalysisCache.clear();
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
    res.json({ success: true, message: 'Cache geleert' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Graceful Shutdown für Cache-Speicherung
process.on('SIGINT', () => {
  console.log('\n🔄 Server wird beendet...');
  saveImageAnalysisCache();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🔄 Server wird beendet...');
  saveImageAnalysisCache();
  process.exit(0);
});

// Server starten
app.listen(PORT, async () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Frontend verfügbar unter: http://localhost:${PORT}`);
  console.log(`API verfügbar unter: http://localhost:${PORT}/api`);
  console.log(`🔍 Upload-Debug-Logs verfügbar unter: http://localhost:${PORT}/api/debug/upload-logs`);
  console.log(`📊 Upload-Diagnose verfügbar unter: http://localhost:${PORT}/api/debug/upload-diagnosis`);
  console.log('Datei-Upload und Validierung gestartet...');
  
  // Initialisiere Google Drive API
  const apiInitialized = await initializeGoogleDriveAPI();
  
  if (apiInitialized) {
    // Teste Google Drive API Zugriff
    try {
      const testResponse = await driveService.files.list({
        pageSize: 10,
        fields: 'files(id,name,mimeType,owners)',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        corpora: 'allDrives'
      });
      console.log('✅ Google Drive API Zugriff erfolgreich getestet');
      console.log(`Service Account kann auf ${testResponse.data.files?.length || 0} Dateien zugreifen`);
      
      if (testResponse.data.files && testResponse.data.files.length > 0) {
        console.log('Verfügbare Dateien:');
        testResponse.data.files.forEach((file, index) => {
          console.log(`  ${index + 1}. ${file.name} (${file.mimeType}) - ID: ${file.id}`);
          if (file.owners && file.owners.length > 0) {
            console.log(`     Besitzer: ${file.owners[0].emailAddress}`);
          }
        });
      } else {
        console.log('⚠️ Service Account hat keine Dateien in seinem Drive');
        console.log('💡 Stellen Sie sicher, dass die Dateien für den Service Account freigegeben sind');
      }
    } catch (testError) {
      console.log('⚠️ Google Drive API Zugriff fehlgeschlagen:', testError.message);
    }
  }
});