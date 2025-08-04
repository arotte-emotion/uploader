export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  missingFields: string[];
}

export interface MetaInfo {
  metaTitle: string;
  metaDescription: string;
}

export interface LocalInfo {
  lineNumber: number;
  content: string;
  originalLine: string;
}

export interface ImageLink {
  lineNumber: number;
  url: string;
  originalUrl: string;
  originalLine: string;
  isConverted: boolean;
  copyright?: string;
}

export interface BriefingData {
  filename: string;
  slug: string | null;
  metaInfo: MetaInfo;
  contentTypes: string[];
  validation: ValidationResult;
  fileSize: number;
  briefingText?: string;
  localInfo: LocalInfo[];
  imageLinks: ImageLink[];
}

export interface ImportResult {
  status: 'success' | 'error';
  message: string;
  entriesCreated: number;
  timestamp: string;
  details: {
    pageCreated: boolean;
    richTextEntries: number;
    faqEntries: number;
    imagesUploaded?: number;
  };
}

export interface ContentType {
  id: string;
  name: string;
  description: string;
} 