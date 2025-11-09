import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Upload, FileText, CreditCard, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import Tesseract from "tesseract.js";

interface ExtractedData {
  cnp?: string;
  birth_date?: string;
  address?: string;
  card_number?: string;
  id_series?: string; // Serie buletin (ex: "AB")
  id_number?: string; // Număr buletin (ex: "123456")
}

const DocumentScanner = () => {
  const [scanning, setScanning] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [documentType, setDocumentType] = useState<"id_card" | "health_card">("id_card");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const processImage = async (file: File) => {
    setScanning(true);
    
    try {
      toast({
        title: "Se scanează documentul...",
        description: "Te rog așteaptă câteva secunde",
      });

      // Improved OCR configuration for better accuracy
      // Use Romanian + English for better character recognition
      const { data: { text } } = await Tesseract.recognize(file, 'ron+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      console.log('[DocumentScanner] OCR Text (raw):', text);
      console.log('[DocumentScanner] OCR Text (lines):', text.split('\n'));

      // Clean text: remove the first line with country names (ROUMANIE ROMANIA ROMANIA)
      const lines = text.split('\n').filter(line => {
        const trimmed = line.trim();
        // Skip lines that are just country names
        if (/^(ROUMANIE|ROMANIA|ROMÂNIA)\s+(ROUMANIE|ROMANIA|ROMÂNIA)\s+(ROUMANIE|ROMANIA|ROMÂNIA)$/i.test(trimmed)) {
          return false;
        }
        return true;
      });
      const cleanedText = lines.join('\n');

      // Extract data using regex patterns
      const extracted: ExtractedData = {};

      // CNP pattern: Look for "CNP:" label followed by 13 digits
      // Be more precise - CNP should be on its own line or after "CNP:" label
      const cnpPatterns = [
        // "CNP: 1234567890123" or "CNP 1234567890123"
        /CNP[:\s]+([1-9]\d{12})\b/i,
        // "Cod Numeric Personal: 1234567890123"
        /Cod[:\s]*[Nn]umeric[:\s]*[Pp]ersonal[:\s]+([1-9]\d{12})\b/i,
        // Standalone 13-digit number (but be more careful)
        /\b([1-9]\d{12})\b/
      ];
      
      for (const pattern of cnpPatterns) {
        const cnpMatches = cleanedText.matchAll(new RegExp(pattern, 'g'));
        for (const cnpMatch of cnpMatches) {
          const cnp = cnpMatch[1] || cnpMatch[0];
          // Validate CNP: must be exactly 13 digits, first digit 1-9
          if (cnp && cnp.length === 13 && /^[1-9]\d{12}$/.test(cnp)) {
            // Additional validation: check if it's not part of a longer number
            const before = cleanedText.substring(Math.max(0, (cnpMatch.index || 0) - 1), cnpMatch.index || 0);
            const after = cleanedText.substring((cnpMatch.index || 0) + cnp.length, (cnpMatch.index || 0) + cnp.length + 1);
            
            // CNP should be surrounded by non-digit characters or line boundaries
            if ((!before || !/\d/.test(before)) && (!after || !/\d/.test(after))) {
              extracted.cnp = cnp;
              
              // Extract birth date from CNP
              const year = parseInt(cnp.substring(1, 3));
              const month = cnp.substring(3, 5);
              const day = cnp.substring(5, 7);
              const century = cnp[0] === '1' || cnp[0] === '2' ? '19' : '20';
              extracted.birth_date = `${century}${year}-${month}-${day}`;
              break;
            }
          }
        }
        if (extracted.cnp) break;
      }

      // Name extraction removed - OCR accuracy issues with names
      // Focus on extracting: CNP, address, birth date, ID series/number

      // Address extraction - Romanian address format
      if (documentType === "id_card") {
        const addressPatterns = [
          // "Adresa:" or "Adresă:" label followed by address
          /(?:Adresa|Adresă|ADRESA)[:\s]+([A-ZĂÎȘȚÂ][A-ZĂÎȘȚÂa-zăâîșț\s,.-]+?)(?:\n|CNP|Serie|Număr|Data|$)/i,
          // "Str. ... Nr. ..." pattern
          /(?:Str\.?|Strada|STRADA)[\s:]+([A-ZĂÎȘȚÂ][A-ZĂÎȘȚÂa-zăâîșț\s]+?)[,\s]+(?:Nr\.?|Număr)[\s:]+(\d+)[,\s]+([A-ZĂÎȘȚÂ][A-ZĂÎȘȚÂa-zăâîșț\s]+?)(?:,|$)/i,
          // Address with street name and number
          /([A-ZĂÎȘȚÂ][A-ZĂÎȘȚÂa-zăâîșț\s]+?),\s*(?:Nr\.?\s*)?(\d+)[,\s]+([A-ZĂÎȘȚÂ][A-ZĂÎȘȚÂa-zăâîșț\s]+?)(?:,|$)/i
        ];

        for (const pattern of addressPatterns) {
          const addressMatch = cleanedText.match(pattern);
          if (addressMatch) {
            let address = '';
            if (addressMatch[1] && addressMatch[2] && addressMatch[3]) {
              // Full address with street, number, city
              address = `${addressMatch[1].trim()}, Nr. ${addressMatch[2].trim()}, ${addressMatch[3].trim()}`;
            } else {
              // Simple address match (from "Adresa:" label)
              address = addressMatch[1] || addressMatch[0];
            }
            // Clean up address: remove extra spaces, keep only valid characters
            address = address
              .replace(/\s+/g, ' ')
              .replace(/[^\w\s,.-ăâîșțĂÂÎȘȚ]/g, '')
              .trim();
            
            // Validate: should not be too short, should not contain country names
            if (address.length > 10 && 
                address.length < 200 && 
                !/^(ROUMANIE|ROMANIA|ROMÂNIA)/i.test(address)) {
              extracted.address = address;
              break;
            }
          }
        }
      }

      // Serie și Număr buletin (ex: "AB 123456" sau "AB123456")
      if (documentType === "id_card") {
        const idSeriesPatterns = [
          // "Serie: AB Număr: 123456" or "Serie AB Nr. 123456"
          /(?:Serie|SERIE)[:\s]*([A-Z]{2})[,\s]*(?:Număr|Numar|NR|Nr\.?)[:\s]*(\d{6,8})/i,
          // "AB 123456" or "AB123456" (but not if it's part of a longer word)
          /\b([A-Z]{2})[\s-]?(\d{6,8})\b/,
          // "Nr. act: AB 123456"
          /(?:Nr\.?\s*act|Număr\s*act)[:\s]*([A-Z]{2})[\s-]?(\d{6,8})/i
        ];

        for (const pattern of idSeriesPatterns) {
          const idMatch = cleanedText.match(pattern);
          if (idMatch) {
            const series = idMatch[1] || idMatch[0]?.match(/[A-Z]{2}/)?.[0];
            const number = idMatch[2] || idMatch[0]?.match(/\d{6,8}/)?.[0];
            
            if (series && /^[A-Z]{2}$/.test(series)) {
              extracted.id_series = series;
            }
            if (number && /^\d{6,8}$/.test(number)) {
              extracted.id_number = number;
            }
            
            if (extracted.id_series || extracted.id_number) {
              break;
            }
          }
        }
      }

      // Data nașterii directă (dacă nu am extras-o din CNP)
      if (!extracted.birth_date) {
        const datePatterns = [
          // "Data nașterii: DD.MM.YYYY"
          /(?:Data\s+nașterii|Data\s+nasterii|Născut|Nascut)[:\s]+(\d{2})[./](\d{2})[./](\d{4})/i,
          // "DD.MM.YYYY" or "DD/MM/YYYY" (but be careful not to match other numbers)
          /\b(\d{2})[./](\d{2})[./](\d{4})\b/
        ];

        for (const pattern of datePatterns) {
          const dateMatch = cleanedText.match(pattern);
          if (dateMatch) {
            const day = dateMatch[1];
            const month = dateMatch[2];
            const year = dateMatch[3];
            // Validate date
            if (parseInt(day) >= 1 && parseInt(day) <= 31 && 
                parseInt(month) >= 1 && parseInt(month) <= 12 &&
                parseInt(year) >= 1900 && parseInt(year) <= 2100) {
              extracted.birth_date = `${year}-${month}-${day}`;
              break;
            }
          }
        }
      }

      // Card number (for health card)
      if (documentType === "health_card") {
        const cardPatterns = [
          /\b\d{16}\b/, // 16 digits
          /(?:Număr|Numar|Nr\.?)[:\s]*card[:\s]*(\d{16})/i
        ];
        
        for (const pattern of cardPatterns) {
          const cardMatch = text.match(pattern);
          if (cardMatch) {
            extracted.card_number = cardMatch[1] || cardMatch[0];
            break;
          }
        }
      }

      console.log('[DocumentScanner] Extracted data:', extracted);

      setExtractedData(extracted);

      // Save to database
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { error } = await supabase
          .from("scanned_documents")
          .insert([{
            user_id: session.user.id,
            document_type: documentType,
            extracted_data: extracted as any,
          }]);

        if (error) throw error;
      }

      toast({
        title: "Scanare completă!",
        description: "Datele au fost extrase cu succes",
      });
    } catch (error: any) {
      console.error("Scanning error:", error);
      toast({
        title: "Eroare la scanare",
        description: "Te rog încearcă din nou cu o imagine mai clară",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  };

  const autofillProfile = async () => {
    if (!extractedData) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Autentificare necesară",
          description: "Trebuie să fii autentificat",
          variant: "destructive",
        });
        return;
      }

      const updateData: any = {};
      
      // Update profile with basic information (id_series and id_number are stored in scanned_documents)
      // Note: full_name extraction removed due to OCR accuracy issues
      if (extractedData.cnp) updateData.cnp = extractedData.cnp;
      if (extractedData.birth_date) updateData.birth_date = extractedData.birth_date;
      if (extractedData.address) updateData.address = extractedData.address;

      // Check if profile exists, if not create it
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      let error;
      if (existingProfile) {
        // Update existing profile
        const result = await supabase
          .from("profiles")
          .update({
            ...updateData,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", session.user.id);
        error = result.error;
      } else {
        // Create new profile
        const result = await supabase
          .from("profiles")
          .insert({
            user_id: session.user.id,
            email: session.user.email,
            ...updateData,
          });
        error = result.error;
      }

      if (error) throw error;

      toast({
        title: "Profil actualizat!",
        description: "Datele tale au fost completate automat. Redirecționare către profil...",
        duration: 3000,
      });

      setExtractedData(null);
      
      // Navigate to profile page after a short delay
      setTimeout(() => {
        window.location.href = "/profile";
      }, 1500);
    } catch (error: any) {
      toast({
        title: "Eroare",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="p-6 glass-card">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">Scanare Documente</h3>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Scanează cardul de sănătate sau buletinul pentru completare automată
      </p>

      <div className="flex gap-2 mb-4">
        <Button
          variant={documentType === "id_card" ? "default" : "outline"}
          size="sm"
          onClick={() => setDocumentType("id_card")}
        >
          <CreditCard className="w-4 h-4 mr-2" />
          Buletin
        </Button>
        <Button
          variant={documentType === "health_card" ? "default" : "outline"}
          size="sm"
          onClick={() => setDocumentType("health_card")}
        >
          <CreditCard className="w-4 h-4 mr-2" />
          Card Sănătate
        </Button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="hidden"
      />

      <div className="flex gap-2 mb-4">
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={scanning}
          className="flex-1"
        >
          <Upload className="w-4 h-4 mr-2" />
          {scanning ? "Se scanează..." : "Încarcă Imagine"}
        </Button>

        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={scanning}
        >
          <Camera className="w-4 h-4" />
        </Button>
      </div>

      {extractedData && (
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm">Date extrase</h4>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExtractedData(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {extractedData.cnp && (
            <div>
              <Label className="text-xs">CNP</Label>
              <p className="text-sm font-medium">{extractedData.cnp}</p>
            </div>
          )}

          {extractedData.birth_date && (
            <div>
              <Label className="text-xs">Data nașterii</Label>
              <p className="text-sm font-medium">{extractedData.birth_date}</p>
            </div>
          )}

          {extractedData.address && (
            <div>
              <Label className="text-xs">Adresă</Label>
              <p className="text-sm font-medium">{extractedData.address}</p>
            </div>
          )}

          {extractedData.id_series && (
            <div>
              <Label className="text-xs">Serie buletin</Label>
              <p className="text-sm font-medium">{extractedData.id_series}</p>
            </div>
          )}

          {extractedData.id_number && (
            <div>
              <Label className="text-xs">Număr buletin</Label>
              <p className="text-sm font-medium">{extractedData.id_number}</p>
            </div>
          )}

          {extractedData.card_number && (
            <div>
              <Label className="text-xs">Număr card</Label>
              <p className="text-sm font-medium">{extractedData.card_number}</p>
            </div>
          )}

          <Button onClick={autofillProfile} className="w-full" size="sm">
            Completează automat profilul
          </Button>
        </div>
      )}

      <div className="mt-4 p-3 bg-accent-light/10 rounded-lg">
        <p className="text-xs text-muted-foreground">
          💡 <strong>Suport NFC:</strong> În viitor vei putea scana documentele direct prin NFC
          pentru o experiență și mai rapidă!
        </p>
      </div>
    </Card>
  );
};

export default DocumentScanner;
