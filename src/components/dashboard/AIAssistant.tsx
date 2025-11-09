import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, User, Sparkles, Pill, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  extractedData?: {
    medications?: Array<{
      medication_name: string;
      dosage: string;
      frequency: string;
    }>;
    appointments?: Array<{
      doctor_name: string;
      specialty: string;
      clinic_name: string;
      appointment_date?: string | null;
      appointment_time?: string | null;
    }>;
  };
}

export interface AIAssistantHandle {
  sendMessage: (message: string) => void;
}

const AIAssistant = forwardRef<AIAssistantHandle>((props, ref) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Bună! Sunt asistentul tău AI medical. Te pot ajuta să găsești clinici, să programezi consultații sau să răspund la întrebări generale despre sănătate. Cu ce te pot ajuta astăzi?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [clinics, setClinics] = useState<any[] | null>(null);
  const [loadingClinics, setLoadingClinics] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendWithMessage = async (messageToSend?: string) => {
    const messageText = messageToSend || input.trim();
    if (!messageText) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!messageToSend) {
      setInput("");
    }
    setIsTyping(true);

    try {
      // Get user location for better recommendations (optional)
      let userLocation: { latitude: number; longitude: number } | null = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
          });
          userLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
        } catch (err) {
          // ignore location errors, proceed without location
          userLocation = null;
        }
      }

      // Send to local AI endpoint (server will call external LLM if configured)
      let resp;
      try {
        resp = await fetch('http://localhost:3001/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })), userLocation })
        });
      } catch (fetchError: any) {
        // Handle network errors
        if (fetchError.message?.includes('Failed to fetch') || fetchError.message?.includes('ERR_BLOCKED_BY_CLIENT')) {
          throw new Error('🔒 Conexiune blocată de extensia browserului!\n\n' +
            'O extensie (ad blocker, privacy tool) blochează conexiunea la localhost.\n\n' +
            'Soluții:\n' +
            '1. Dezactivează temporar ad blocker-ul pentru localhost\n' +
            '2. Adaugă localhost la whitelist în extensia de securitate\n' +
            '3. Testează în modul incognito/private (fără extensii)\n' +
            '4. Verifică dacă serverul rulează: http://localhost:3001/api/status');
        }
        throw fetchError;
      }

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unknown error');
        console.error('Server error response:', resp.status, errorText);
        throw new Error(`Server error (${resp.status}): ${errorText.slice(0, 200)}`);
      }

      const payload = await resp.json();
      
      // Check if server returned an error
      if (payload.error) {
        throw new Error(payload.error);
      }

      // Save extracted medications and appointments to Supabase
      if (payload.extractedData) {
        const { medications, appointments } = payload.extractedData;
        const answerText = (payload.answer || '').toLowerCase();
        
        // Get current user
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Save medications - verify they appear in LLM response text
          if (medications && medications.length > 0) {
            // Filter medications to only include those that appear in the LLM response
            const validMedications = medications.filter(med => {
              const medNameLower = med.medication_name.toLowerCase();
              // Check if medication name appears in the answer text
              return answerText.includes(medNameLower) || 
                     answerText.includes(medNameLower.split(' ')[0]); // Check first word if multi-word
            });
            
            if (validMedications.length > 0) {
              let savedCount = 0;
              for (const med of validMedications) {
                const { error } = await supabase.from('user_medications').insert({
                  user_id: session.user.id,
                  medication_name: med.medication_name,
                  dosage: med.dosage,
                  frequency: med.frequency
                });
                if (!error) savedCount++;
              }
              
              if (savedCount > 0) {
                // Show notification in bottom right
                toast({
                  title: "💊 Medicament identificat",
                  description: `${savedCount} medicament${savedCount > 1 ? 'e' : ''} ${savedCount > 1 ? 'au fost' : 'a fost'} identificat${savedCount > 1 ? 'e' : ''} și ${savedCount > 1 ? 'au fost' : 'a fost'} adăugat${savedCount > 1 ? 'e' : ''} în lista de Medicație`,
                  duration: 5000,
                });
              }
            }
          }

          // Save appointments (replace existing if any)
          if (appointments && appointments.length > 0) {
            // Delete existing appointments for this user
            await supabase.from('user_appointments').delete().eq('user_id', session.user.id);
            
            // Insert new appointment
            let savedCount = 0;
            for (const apt of appointments) {
              const { error } = await supabase.from('user_appointments').insert({
                user_id: session.user.id,
                doctor_name: apt.doctor_name,
                specialty: apt.specialty,
                clinic_name: apt.clinic_name,
                appointment_date: apt.appointment_date || null,
                appointment_time: apt.appointment_time || null
              });
              if (!error) savedCount++;
            }
            
            if (savedCount > 0) {
              const apt = appointments[0];
              // Show notification in bottom right
              toast({
                title: "📅 Programare identificată",
                description: `Programarea cu ${apt.doctor_name} la ${apt.clinic_name} a fost identificată și adăugată în lista de Următoarea consultație`,
                duration: 5000,
              });
            }
          }
        }
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: payload.answer || 'Nu am găsit un răspuns.',
        timestamp: new Date(),
        extractedData: payload.extractedData || undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    } catch (error: any) {
      console.error("AI error:", error);
      console.error("Error details:", {
        message: error?.message,
        stack: error?.stack,
        name: error?.name
      });
      
      // Show actual error message to help debug
      let errorContent = "Ne cerem scuze, a apărut o eroare. Te rog încearcă din nou.";
      
      if (error?.message) {
        // If error message contains newlines, preserve them (for formatted errors)
        if (error.message.includes('\n')) {
          errorContent = error.message;
        } else {
          errorContent = `Eroare: ${error.message}`;
        }
        
        // Add helpful suggestions based on error
        if (error.message.includes('blocată') || error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
          // Already has detailed message, don't add more
        } else if (error.message.includes('conecta la server') || error.message.includes('Failed to fetch')) {
          errorContent += '\n\n💡 Verifică:\n1. Serverul rulează? (http://localhost:3001/api/status)\n2. Portul 3001 este accesibil?\n3. Nu ai extensii care blochează localhost?';
        } else if (error.message.includes('500') || error.message.includes('invalid payload')) {
          errorContent += '\n\n💡 Eroare la server. Verifică consola serverului pentru detalii.';
        }
      }
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: errorContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsTyping(false);
    }
  };

  // Expose sendMessage method to parent
  useImperativeHandle(ref, () => ({
    sendMessage: (message: string) => {
      handleSendWithMessage(message);
    },
  }));

  const handleSend = async () => {
    if (!input.trim()) return;
    await handleSendWithMessage();
  };

  const findNearbyClinics = async (openNow = true) => {
    if (!navigator.geolocation) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Localizarea nu este disponibilă în browserul tău.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    setLoadingClinics(true);
    try {
      // Check if secure origin (localhost or HTTPS)
      const isSecureOrigin = window.location.protocol === 'https:' || 
                            window.location.hostname === 'localhost' || 
                            window.location.hostname === '127.0.0.1';
      
      if (!isSecureOrigin) {
        throw new Error('Geolocation requires HTTPS or localhost. Please use http://localhost:5173');
      }

      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          enableHighAccuracy: false
        });
      });
      const userLocation = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      const resp = await fetch('http://localhost:3001/api/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: userLocation.latitude, longitude: userLocation.longitude, type: 'pharmacy', openNow, maxResults: 5 })
      });
      if (!resp.ok) throw new Error('Eroare la server');
      const data = await resp.json();
      const clinicsList = data.clinics || [];
      setClinics(clinicsList);

      // Debug: if zero results, include provider and server raw snippet in chat to help troubleshooting
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: clinicsList.length > 0
          ? (data.answer || `Am găsit ${clinicsList.length} farmacii în apropiere.`)
          : `Am găsit 0 farmacii. Provider: ${data.provider || 'unknown'}. Răspuns server (trunchiat): ${JSON.stringify(data).slice(0, 200)}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (e: any) {
      console.error('findNearbyClinics error', e);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Nu am putut obține lista de farmacii. Te rog încearcă din nou.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoadingClinics(false);
    }
  };

  const suggestedQuestions = [
    "Unde găsesc cel mai apropiat pediatru?",
    "Care sunt clinicile cu timp de așteptare mic?",
    "Vreau să programez analize de sânge",
    "Am nevoie de un dermatolog urgent",
  ];

  return (
    <Card className="glass-card flex flex-col h-[600px]">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-accent-light/30 to-primary-light/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full gradient-accent flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              AI Asistent Medical
              <Sparkles className="w-4 h-4 text-accent" />
            </h3>
            <p className="text-xs text-muted-foreground">Întotdeauna online pentru tine</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${message.role === "user"
                ? "bg-primary"
                : "gradient-accent"
                }`}
            >
              {message.role === "user" ? (
                <User className="w-5 h-5 text-white" />
              ) : (
                <Bot className="w-5 h-5 text-white" />
              )}
            </div>
            <div
              className={`flex-1 max-w-[80%] ${message.role === "user" ? "text-right" : ""
                }`}
            >
              <div
                className={`inline-block p-3 rounded-2xl ${message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
                  }`}
              >
                <p className="text-sm whitespace-pre-line">{message.content}</p>
                
                {/* Visual hints for medications and appointments */}
                {message.extractedData && message.role === "assistant" && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                    {message.extractedData.medications && message.extractedData.medications.length > 0 && (
                      <div className="Medicatie flex items-start gap-2 p-2 rounded-lg bg-primary/10 border border-primary/20">
                        <Pill className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <Badge variant="outline" className="mb-1 text-xs">
                            💊 Medicament detectat
                          </Badge>
                          <div className="space-y-1">
                            {message.extractedData.medications.map((med, idx) => (
                              <p key={idx} className="text-xs text-muted-foreground">
                                <span className="font-medium">{med.medication_name}</span> - {med.dosage}, {med.frequency}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {message.extractedData.appointments && message.extractedData.appointments.length > 0 && (
                      <div className="Urmatoarea consultatie flex items-start gap-2 p-2 rounded-lg bg-accent/10 border border-accent/20">
                        <Calendar className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <Badge variant="outline" className="mb-1 text-xs">
                            📅 Programare detectată
                          </Badge>
                          <div className="space-y-1">
                            {message.extractedData.appointments.map((apt, idx) => (
                              <div key={idx} className="text-xs text-muted-foreground">
                                <p className="font-medium">{apt.doctor_name}</p>
                                <p>{apt.specialty} - {apt.clinic_name}</p>
                                {apt.appointment_date && (
                                  <p className="text-primary">📆 {apt.appointment_date}{apt.appointment_time ? ` la ${apt.appointment_time}` : ''}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {message.timestamp.toLocaleTimeString("ro-RO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-muted p-3 rounded-2xl">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {messages.length === 1 && (
        <div className="px-4 pb-3 space-y-2">
          <p className="text-xs text-muted-foreground">Sugestii:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((question, index) => (
              <Badge
                key={index}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => setInput(question)}
              >
                {question}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="px-4 pb-3 space-y-2">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => findNearbyClinics(true)} disabled={loadingClinics}>
            {loadingClinics ? 'Caut...' : 'Găsește farmacii deschise'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => findNearbyClinics(false)} disabled={loadingClinics}>
            {loadingClinics ? 'Caut...' : 'Toate farmaciile din apropiere'}
          </Button>
        </div>
      </div>

      {/* Clinics results */}
      {clinics && clinics.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          <p className="text-sm font-semibold">Farmacii găsite:</p>
          <div className="flex flex-col gap-2">
            {clinics.map((c: any) => (
              <Card key={c.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm text-muted-foreground">{c.address}</div>
                    <div className="text-xs text-muted-foreground">{c.distanceKm ? `${c.distanceKm.toFixed(1)} km` : ''} {c.openNow === true ? ' — Deschis' : c.openNow === false ? ' — Închis' : ''}</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {c.phone && <a className="text-sm text-primary" href={`tel:${c.phone}`}>Sună</a>}
                    {c.mapsUrl && <a className="text-sm" target="_blank" rel="noreferrer" href={c.mapsUrl}>Vezi pe hartă</a>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t bg-card/50">
        <div className="flex gap-2">
          <Input
            placeholder="Scrie un mesaj..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={!input.trim() || isTyping}>
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </Card>
  );
});

AIAssistant.displayName = "AIAssistant";

export default AIAssistant;
