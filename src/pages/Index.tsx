import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Activity, MapPin, MessageSquare, Mic, Bell, Zap, Shield, Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background via-primary-light/10 to-accent-light/10">
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <div className="container mx-auto px-4 py-20 lg:py-32 relative">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card animate-float">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">AI-powered Healthcare Assistant</span>
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-bold leading-tight">
              Asistentul tău medical{" "}
              <span className="text-gradient">inteligent</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Acces rapid la servicii medicale, ghidare AI, comandă vocală și automatizare completă. 
              Totul într-o singură platformă revoluționară.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button 
                size="lg" 
                className="gradient-primary text-white shadow-lg hover:shadow-xl transition-all text-lg px-8 py-6"
                onClick={() => navigate('/dashboard')}
              >
                Începe acum
                <Activity className="ml-2 w-5 h-5" />
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                Vezi demo
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto pt-12">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">1000+</p>
                <p className="text-sm text-muted-foreground">Clinici conectate</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-secondary">24/7</p>
                <p className="text-sm text-muted-foreground">Asistent AI</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-accent">50k+</p>
                <p className="text-sm text-muted-foreground">Utilizatori activi</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Funcționalități revoluționare</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Tehnologie avansată pentru o experiență medicală fără precedent
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="p-8 glass-card hover:shadow-xl transition-all group">
              <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <MapPin className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Hartă inteligentă</h3>
              <p className="text-muted-foreground">
                Găsește clinici, spitale și farmacii în timp real, cu timpi de așteptare actualizați și disponibilitate medici.
              </p>
            </Card>

            <Card className="p-8 glass-card hover:shadow-xl transition-all group">
              <div className="w-14 h-14 rounded-2xl gradient-accent flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3">AI Asistent</h3>
              <p className="text-muted-foreground">
                Chatbot inteligent pentru recomandări medicale, sugestii personalizate și răspunsuri instant la întrebări.
              </p>
            </Card>

            <Card className="p-8 glass-card hover:shadow-xl transition-all group">
              <div className="w-14 h-14 rounded-2xl gradient-secondary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Mic className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Control vocal</h3>
              <p className="text-muted-foreground">
                Comandă întreaga platformă prin voce. Accesibilitate totală pentru persoane cu deficiențe de vedere.
              </p>
            </Card>

            <Card className="p-8 glass-card hover:shadow-xl transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Automatizare formulare</h3>
              <p className="text-muted-foreground">
                Completare automată a documentelor medicale folosind AI. Salvează timp prețios și elimină birocrația.
              </p>
            </Card>

            <Card className="p-8 glass-card hover:shadow-xl transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Bell className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Notificări inteligente</h3>
              <p className="text-muted-foreground">
                Reminder-uri pentru consultații, medicație, vaccinări și alerte personalizate bazate pe profilul tău.
              </p>
            </Card>

            <Card className="p-8 glass-card hover:shadow-xl transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Securitate maximă</h3>
              <p className="text-muted-foreground">
                Date medicale criptate, conformitate GDPR și protecție avansată a informațiilor personale.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-10" />
        <div className="container mx-auto px-4 relative">
          <Card className="max-w-4xl mx-auto p-12 glass-card text-center">
            <Globe className="w-16 h-16 mx-auto mb-6 text-primary animate-pulse-glow" />
            <h2 className="text-4xl font-bold mb-4">Revoluționează-ți experiența medicală</h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Alătură-te comunității de utilizatori care au simplificat accesul la servicii medicale cu HealthHub AI
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="gradient-primary text-white text-lg px-8 py-6"
                onClick={() => navigate('/dashboard')}
              >
                Creează cont gratuit
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                Află mai multe
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-bold">HealthHub AI</p>
                <p className="text-xs text-muted-foreground">Asistent medical inteligent</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 HealthHub AI. Toate drepturile rezervate.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
