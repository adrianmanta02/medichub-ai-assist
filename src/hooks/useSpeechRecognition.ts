import { useState, useEffect, useRef, useCallback } from 'react';

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}

interface UseSpeechRecognitionOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

export const useSpeechRecognition = (options: UseSpeechRecognitionOptions = {}) => {
  const {
    lang = 'ro-RO',
    continuous = true,
    interimResults = false,
    onResult,
    onError,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Speech recognition nu este suportat în acest browser. Folosește Chrome sau Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = lang;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      console.log('[Speech] Recognition started');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      const fullTranscript = finalTranscript || interimTranscript;
      setTranscript(fullTranscript.trim());

      if (onResult) {
        onResult(fullTranscript.trim(), finalTranscript.length > 0);
      }

      if (finalTranscript) {
        console.log('[Speech] Final transcript:', finalTranscript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[Speech] Error:', event.error, event.message);
      let errorMessage = 'Eroare la recunoașterea vocală';

      switch (event.error) {
        case 'no-speech':
          errorMessage = 'Nu s-a detectat vorbire. Te rugăm să vorbești mai clar.';
          break;
        case 'audio-capture':
          errorMessage = 'Microfonul nu este disponibil. Verifică setările.';
          break;
        case 'not-allowed':
          errorMessage = 'Permisiunea pentru microfon a fost refuzată.';
          break;
        case 'network':
          errorMessage = 'Eroare de rețea. Verifică conexiunea.';
          break;
        case 'aborted':
          // User stopped, not an error
          return;
        default:
          errorMessage = `Eroare: ${event.error}`;
      }

      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      console.log('[Speech] Recognition ended');
      
      // Auto-restart if continuous mode and was listening
      if (continuous && isListening) {
        try {
          recognition.start();
        } catch (e) {
          // Ignore restart errors
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [lang, continuous, interimResults, onResult, onError, isListening]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError('Speech recognition nu este disponibil');
      return;
    }

    try {
      recognitionRef.current.start();
    } catch (error: any) {
      console.error('[Speech] Start error:', error);
      if (error.message?.includes('already started')) {
        // Already started, ignore
        return;
      }
      setError('Nu s-a putut porni recunoașterea vocală');
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error('[Speech] Stop error:', error);
      }
    }
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
    isSupported: typeof window !== 'undefined' && 
                 (window.SpeechRecognition || window.webkitSpeechRecognition) !== undefined,
  };
};

