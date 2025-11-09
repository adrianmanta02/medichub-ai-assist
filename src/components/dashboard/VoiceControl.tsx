import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { parseVoiceCommand, VoiceCommandAction } from "@/utils/voiceCommands";

interface VoiceControlProps {
  isActive: boolean;
  onToggle: () => void;
  onCommand?: (command: VoiceCommandAction) => void;
}

const VoiceControl = ({ isActive, onToggle, onCommand }: VoiceControlProps) => {
  const lastProcessedRef = useRef<string>('');

  const { isListening, transcript, error, startListening, stopListening, isSupported } = useSpeechRecognition({
    lang: 'ro-RO',
    continuous: true,
    interimResults: false,
    onResult: (transcript, isFinal) => {
      if (isFinal && transcript && transcript !== lastProcessedRef.current) {
        lastProcessedRef.current = transcript;
        console.log('[Voice] Command received:', transcript);
        
        const command = parseVoiceCommand(transcript);
        
        // Show feedback
        toast.info("Comandă recunoscută", {
          description: `"${transcript}"`,
          duration: 2000,
        });

        // Execute command
        if (onCommand) {
          onCommand(command);
        }
      }
    },
    onError: (errorMsg) => {
      toast.error("Eroare recunoaștere vocală", {
        description: errorMsg,
      });
    },
  });

  // Sync listening state with isActive prop
  useEffect(() => {
    if (isActive && !isListening && isSupported) {
      startListening();
    } else if (!isActive && isListening) {
      stopListening();
      lastProcessedRef.current = '';
    }
  }, [isActive, isListening, isSupported, startListening, stopListening]);

  const handleToggle = () => {
    if (!isSupported) {
      toast.error("Speech recognition nu este suportat", {
        description: "Folosește Chrome sau Edge pentru control vocal",
      });
      return;
    }

    onToggle();
    
    if (!isActive) {
      toast.success("Control vocal activat", {
        description: "Spune o comandă (ex: 'Deschide harta', 'Întreabă AI: ...')",
        duration: 4000,
      });
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
      disabled={!isSupported}
      title={isSupported ? (isActive ? "Oprește control vocal" : "Activează control vocal") : "Speech recognition nu este suportat"}
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
