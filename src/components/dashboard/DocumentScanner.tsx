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
  full_name?: string;
  birth_date?: string;
  address?: string;
  card_number?: string;
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

      const { data: { text } } = await Tesseract.recognize(file, 'ron', {
        logger: (m) => console.log(m),
      });

      // Extract data using regex patterns
      const extracted: ExtractedData = {};

      // CNP pattern: 13 digits
      const cnpMatch = text.match(/\b[1-9]\d{12}\b/);
      if (cnpMatch) {
        extracted.cnp = cnpMatch[0];
        
        // Extract birth date from CNP
        const year = parseInt(cnpMatch[0].substring(1, 3));
        const month = cnpMatch[0].substring(3, 5);
        const day = cnpMatch[0].substring(5, 7);
        const century = cnpMatch[0][0] === '1' || cnpMatch[0][0] === '2' ? '19' : '20';
        extracted.birth_date = `${century}${year}-${month}-${day}`;
      }

      // Name pattern (all caps words)
      const nameMatches = text.match(/\b[A-ZĂÎȘȚÂ]{2,}\s+[A-ZĂÎȘȚÂ]{2,}/g);
      if (nameMatches && nameMatches.length > 0) {
        extracted.full_name = nameMatches[0];
      }

      // Card number (for health card)
      const cardMatch = text.match(/\b\d{16}\b/);
      if (cardMatch && documentType === "health_card") {
        extracted.card_number = cardMatch[0];
      }

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

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: extractedData.full_name,
          cnp: extractedData.cnp,
          birth_date: extractedData.birth_date,
        })
        .eq("user_id", session.user.id);

      if (error) throw error;

      toast({
        title: "Profil actualizat!",
        description: "Datele tale au fost completate automat",
      });

      setExtractedData(null);
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

          {extractedData.full_name && (
            <div>
              <Label className="text-xs">Nume</Label>
              <p className="text-sm font-medium">{extractedData.full_name}</p>
            </div>
          )}

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
