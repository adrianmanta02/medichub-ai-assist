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

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: generateMockResponse(input),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const generateMockResponse = (userInput: string): string => {
    const lowerInput = userInput.toLowerCase();
    
    if (lowerInput.includes("pediatru") || lowerInput.includes("copil")) {
      return "Am găsit 3 clinici cu pediatri disponibili în zona ta:\n\n1. Clinica Regina Maria - Dr. Ionescu Ana (disponibil mâine la 10:00)\n2. MedLife Pediatrie - Dr. Popescu Ion (disponibil astăzi la 16:30)\n3. Spitalul Marie Curie - Program urgențe 24/7\n\nVrei să programez o consultație?";
    }
    
    if (lowerInput.includes("analize") || lowerInput.includes("test")) {
      return "Pentru analize de laborator, îți recomand:\n\n1. Synevo - Recoltare fără programare, 07:00-11:00\n2. Bioclinica - Programare online disponibilă\n3. Regina Maria - Rezultate în 24h\n\nCe tip de analize ai nevoie?";
    }
    
    if (lowerInput.includes("program") || lowerInput.includes("consultație")) {
      return "Perfect! Ca să te ajut să programezi o consultație, am nevoie de câteva detalii:\n\n- Ce specialitate medicală cauți?\n- Ai o preferință pentru clinică?\n- Ce interval orar preferi?\n\nÎmi poți spune aceste detalii?";
    }

    return "Am înțeles întrebarea ta. Pentru recomandări medicale personalizate, îți sugerez să consulți direct un medic specialist. Pot să te ajut să găsești clinica cea mai apropiată sau să programezi o consultație. Ce preferi?";
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
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                message.role === "user"
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
              className={`flex-1 max-w-[80%] ${
                message.role === "user" ? "text-right" : ""
              }`}
            >
              <div
                className={`inline-block p-3 rounded-2xl ${
                  message.role === "user"
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
