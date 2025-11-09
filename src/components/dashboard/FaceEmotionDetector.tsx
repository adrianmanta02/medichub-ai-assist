import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera, CameraOff, Smile, Frown, Meh, AlertCircle, Moon } from 'lucide-react';
import { Emotion } from '@/hooks/useFaceEmotion';

interface FaceEmotionDetectorProps {
  onEmotionChange?: (emotion: Emotion) => void;
  autoStart?: boolean;
}

const emotionIcons = {
  happy: Smile,
  calm: Meh,
  sad: Frown,
  anxious: AlertCircle,
  tired: Moon,
};

const emotionLabels = {
  happy: 'Fericit',
  calm: 'Calm',
  sad: 'Trist',
  anxious: 'Anxios',
  tired: 'Obosit',
};

const emotionColors = {
  happy: 'bg-green-500/20 text-green-700 border-green-500/30',
  calm: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  sad: 'bg-gray-500/20 text-gray-700 border-gray-500/30',
  anxious: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  tired: 'bg-purple-500/20 text-purple-700 border-purple-500/30',
};

export const FaceEmotionDetector = ({ onEmotionChange, autoStart = false }: FaceEmotionDetectorProps) => {
  const [selectedEmotion, setSelectedEmotion] = useState<Emotion>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  const handleManualSelect = (emotion: Emotion) => {
    setSelectedEmotion(emotion);
    if (onEmotionChange) {
      onEmotionChange(emotion);
    }
  };

  const handleToggle = () => {
    setIsDetecting(!isDetecting);
    if (!isDetecting) {
      // Start detection - simplified version
      // For now, just allow manual selection for faster UX
    } else {
      setSelectedEmotion(null);
      if (onEmotionChange) {
        onEmotionChange(null);
      }
    }
  };

  const EmotionIcon = selectedEmotion ? emotionIcons[selectedEmotion] : null;

  return (
    <Card className="p-4 glass-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Detecție emoții</span>
        </div>
        <Button
          variant={isDetecting ? "destructive" : "outline"}
          size="sm"
          onClick={handleToggle}
        >
          {isDetecting ? (
            <>
              <CameraOff className="w-4 h-4 mr-2" />
              Oprește
            </>
          ) : (
            <>
              <Camera className="w-4 h-4 mr-2" />
              Pornește
            </>
          )}
        </Button>
      </div>

      {/* Quick manual selection - faster than face detection */}
      <div className="mb-3">
        <p className="text-xs text-muted-foreground mb-2">Selectează rapid starea ta:</p>
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(emotionIcons).map(([emotionKey, Icon]) => (
            <button
              key={emotionKey}
              onClick={() => handleManualSelect(emotionKey as Emotion)}
              className={`p-2 rounded-lg border transition-all ${
                selectedEmotion === emotionKey
                  ? `${emotionColors[emotionKey as keyof typeof emotionColors]} border-2`
                  : 'border-border hover:border-primary/50'
              }`}
              title={emotionLabels[emotionKey as keyof typeof emotionLabels]}
            >
              <Icon className="w-5 h-5 mx-auto" />
            </button>
          ))}
        </div>
      </div>

      {selectedEmotion && (
        <div className="flex items-center gap-2">
          {EmotionIcon && <EmotionIcon className="w-5 h-5" />}
          <Badge variant="outline" className={emotionColors[selectedEmotion]}>
            {emotionLabels[selectedEmotion]}
          </Badge>
        </div>
      )}

      {isDetecting && (
        <div className="mt-3 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
          💡 Pentru detecție automată, instalează face-api.js sau configurează un API extern
        </div>
      )}
    </Card>
  );
};

