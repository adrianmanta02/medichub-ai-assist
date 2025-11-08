import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

interface VoiceControlProps {
  isActive: boolean;
  onToggle: () => void;
}

const VoiceControl = ({ isActive, onToggle }: VoiceControlProps) => {
  const handleToggle = () => {
    onToggle();
    
    if (!isActive) {
      toast.success("Control vocal activat", {
        description: "Spune o comandă pentru a începe",
      });
      
      // Mock voice recognition - in production, use Web Speech API
      setTimeout(() => {
        toast.info("Comandă recunoscută", {
          description: '"Arată-mi clinicile disponibile"',
        });
      }, 3000);
    } else {
      toast.info("Control vocal dezactivat");
    }
  };

  return (
    <Button
      variant={isActive ? "default" : "outline"}
      size="icon"
      onClick={handleToggle}
      className={`relative ${
        isActive ? "gradient-primary animate-pulse-glow" : ""
      }`}
    >
      {isActive ? (
        <Mic className="w-5 h-5 text-white" />
      ) : (
        <MicOff className="w-5 h-5" />
      )}
      {isActive && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
      )}
    </Button>
  );
};

export default VoiceControl;
