import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, MessageSquare, Mic, Bell, User, Activity, Clock, Star, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import RealTimeMapView from "@/components/dashboard/RealTimeMapView";
import AIAssistant from "@/components/dashboard/AIAssistant";
import VoiceControl from "@/components/dashboard/VoiceControl";
import NotificationPanel from "@/components/dashboard/NotificationPanel";
import DocumentScanner from "@/components/dashboard/DocumentScanner";
import { supabase } from "@/integrations/supabase/client";
import useWaitTimes from "@/hooks/useWaitTimes";
import { useToast } from "@/hooks/use-toast";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<"map" | "chat" | "notifications">("map");
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [user, setUser] = useState<any>(null);
  const { globalAverage: globalAverageWaitTime } = useWaitTimes(2);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check authentication
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    // Update time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(timer);
    };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Deconectare reușită",
      description: "Pe curând!",
    });
    navigate("/");
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary-light/5 to-accent-light/5">
      {/* Header */}
      <header className="glass-card border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
            <div>
              <h1 className="text-xl font-bold">HealthHub AI</h1>
              <p className="text-xs text-muted-foreground">
                {currentTime.toLocaleDateString('ro-RO', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })} - {currentTime.toLocaleTimeString('ro-RO')}
              </p>
            </div>
            </div>
            
            <div className="flex items-center gap-2">
              <VoiceControl 
                isActive={isVoiceActive} 
                onToggle={() => setIsVoiceActive(!isVoiceActive)} 
              />
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 glass-card hover:shadow-lg transition-all">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">24</p>
                <p className="text-xs text-muted-foreground">Clinici disponibile</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 glass-card hover:shadow-lg transition-all">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                <Clock className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{globalAverageWaitTime} min</p>
                <p className="text-xs text-muted-foreground">Timp mediu așteptare</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 glass-card hover:shadow-lg transition-all">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">AI</p>
                <p className="text-xs text-muted-foreground">Asistent activ</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 glass-card hover:shadow-lg transition-all">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Star className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">128</p>
                <p className="text-xs text-muted-foreground">Puncte sănătate</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === "map" ? "default" : "outline"}
            onClick={() => setActiveTab("map")}
            className="flex-1"
          >
            <MapPin className="w-4 h-4 mr-2" />
            Hartă
          </Button>
          <Button
            variant={activeTab === "chat" ? "default" : "outline"}
            onClick={() => setActiveTab("chat")}
            className="flex-1"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            AI Asistent
          </Button>
          <Button
            variant={activeTab === "notifications" ? "default" : "outline"}
            onClick={() => setActiveTab("notifications")}
            className="flex-1"
          >
            <Bell className="w-4 h-4 mr-2" />
            Notificări
          </Button>
        </div>

        {/* Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {activeTab === "map" && <RealTimeMapView />}
            {activeTab === "chat" && <AIAssistant />}
            {activeTab === "notifications" && <NotificationPanel />}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="p-6 glass-card">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Următoarea consultație
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">Dr. Popescu Maria</p>
                    <p className="text-sm text-muted-foreground">Medicină generală</p>
                  </div>
                  <Badge variant="secondary">Mâine</Badge>
                </div>
                <div className="text-sm">
                  <p className="text-muted-foreground">Ora: 10:00</p>
                  <p className="text-muted-foreground">Clinica MedLife</p>
                </div>
                <Button size="sm" className="w-full">
                  Vezi detalii
                </Button>
              </div>
            </Card>

            <Card className="p-6 glass-card">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-accent" />
                Medicație
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Paracetamol</p>
                    <p className="text-xs text-muted-foreground">500mg, 3x/zi</p>
                  </div>
                  <Badge variant="outline">12:00</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Vitamina D</p>
                    <p className="text-xs text-muted-foreground">1000 UI, 1x/zi</p>
                  </div>
                  <Badge variant="outline">Dimineața</Badge>
                </div>
              </div>
            </Card>

            <DocumentScanner />

            <Card className="p-6 glass-card gradient-accent">
              <h3 className="font-semibold mb-2 text-white">💡 Sfat zilnic</h3>
              <p className="text-sm text-white/90">
                Hidratarea este esențială! Asigură-te că bei cel puțin 2L de apă pe zi.
              </p>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
