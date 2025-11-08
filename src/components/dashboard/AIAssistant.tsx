import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, User, Sparkles } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const AIAssistant = () => {
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
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
      const resp = await fetch('http://localhost:3001/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })), userLocation })
      });

      if (!resp.ok) throw new Error('AI server error');

      const payload = await resp.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: payload.answer || 'Nu am găsit un răspuns.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    } catch (error: any) {
      console.error("AI error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Ne cerem scuze, a apărut o eroare. Te rog încearcă din nou.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsTyping(false);
    }
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
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
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
};

export default AIAssistant;
