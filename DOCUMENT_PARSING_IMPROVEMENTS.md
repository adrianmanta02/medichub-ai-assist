# Îmbunătățiri pentru Parsarea Documentelor

## Probleme Identificate
1. OCR nu recunoaște corect numele (caractere ciudate, matching greșit)
2. CNP nu este extras corect (cifre lipsă sau greșite)
3. Adresa nu este extrasă

## Soluții Implementate

### 1. Îmbunătățiri OCR (Tesseract)
- **Limbă combinată**: `'ron+eng'` - folosește atât română cât și engleză pentru mai bună acuratețe
- **PSM Mode 6**: Page Segmentation Mode pentru blocuri uniforme de text (ideal pentru documente structurate)
- **Character Whitelist**: Limitează caracterele permise pentru a reduce erorile OCR
- **Preprocesare text**: Elimină caractere OCR comune (`|`, `_`)

### 2. Parsare Îmbunătățită
- **Curățare agresivă**: Elimină liniile cu doar caractere speciale
- **Matching flexibil**: Acceptă erori OCR minore în etichete ("Num e" în loc de "Nume")
- **Validare strictă**: Verifică că numele conține litere, nu doar cifre

### 3. Fallback Multi-nivel
- Nivel 1: Parsare structurală (linie cu etichetă → linia următoare)
- Nivel 2: Pattern matching cu etichete pe aceeași linie
- Nivel 3: Pattern matching generic

## Alternative OCR (Dacă Tesseract nu funcționează bine)

### 1. Google Cloud Vision API ⭐ (Recomandat)
**Avantaje:**
- Acuratețe foarte bună pentru română
- Suport excelent pentru documente structurate
- Text detection + document parsing

**Dezavantaje:**
- Necesită API key (costuri mici)
- Necesită backend pentru a nu expune API key-ul

**Implementare:**
```javascript
// Backend endpoint: /api/ocr
const vision = require('@google-cloud/vision');
const client = new vision.ImageAnnotatorClient();

const [result] = await client.textDetection(imageBuffer);
const text = result.textAnnotations[0].description;
```

### 2. Azure Computer Vision
**Avantaje:**
- Acuratețe bună
- Suport pentru română
- Document Intelligence pentru structură

**Dezavantaje:**
- Necesită API key
- Necesită backend

### 3. AWS Textract
**Avantaje:**
- Excelent pentru documente structurate
- Detectează automat câmpuri (nume, adresă, etc.)

**Dezavantaje:**
- Costuri mai mari
- Necesită backend

### 4. EasyOCR (Python) + API
**Avantaje:**
- Open source
- Suport bun pentru română
- Poate rula local sau pe server

**Dezavantaje:**
- Necesită Python backend
- Mai lent decât cloud APIs

## Recomandare

**Pentru început:** Îmbunătățirile actuale cu Tesseract ar trebui să funcționeze mai bine.

**Dacă problema persistă:** Recomand **Google Cloud Vision API** pentru:
- Acuratețe superioară
- Suport excelent pentru română
- Prețuri rezonabile (primi 1000 requests/lună gratuite)

## Pași Următori

1. **Testează îmbunătățirile actuale** - ar trebui să fie mai bune
2. **Verifică consola** - vezi exact ce text extrage OCR-ul
3. **Dacă nu funcționează:**
   - Implementăm Google Cloud Vision API pe backend
   - Sau folosim un serviciu OCR specializat pentru documente românești

