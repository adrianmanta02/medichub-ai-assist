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
  const [medications, setMedications] = useState<any[]>([]);
  const [appointment, setAppointment] = useState<any | null>(null);
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
        loadUserData(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        loadUserData(session.user.id);
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

  const loadUserData = async (userId: string, showNotifications = false) => {
    // Load medications
    const { data: meds } = await supabase
      .from('user_medications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (meds) {
      // Check if new medications were added
      if (showNotifications && meds.length > medications.length) {
        const newMeds = meds.slice(0, meds.length - medications.length);
        newMeds.forEach(med => {
          toast({
            title: "💊 Medicament actualizat",
            description: `${med.medication_name} ${med.dosage} a fost adăugat în Medicație`,
            duration: 3000,
          });
        });
      }
      setMedications(meds);
    }

    // Load next appointment
    const { data: appointments } = await supabase
      .from('user_appointments')
      .select('*')
      .eq('user_id', userId)
      .order('appointment_date', { ascending: true })
      .limit(1);
    
    if (appointments && appointments.length > 0) {
      // Check if appointment was updated
      if (showNotifications && (!appointment || appointment.id !== appointments[0].id)) {
        toast({
          title: "📅 Programare actualizată",
          description: `Programare cu ${appointments[0].doctor_name} a fost actualizată`,
          duration: 3000,
        });
      }
      setAppointment(appointments[0]);
    } else {
      setAppointment(null);
    }
  };

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return;

    const medChannel = supabase
      .channel('user_medications_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'user_medications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log('[realtime] Medication change:', payload.eventType);
          loadUserData(user.id, true); // Show notifications for real-time updates
        }
      )
      .subscribe();

    const aptChannel = supabase
      .channel('user_appointments_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'user_appointments', filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log('[realtime] Appointment change:', payload.eventType);
          loadUserData(user.id, true); // Show notifications for real-time updates
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(medChannel);
      supabase.removeChannel(aptChannel);
    };
  }, [user, medications, appointment]);

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
    <div className="min-h-screen bg-gradient-to-br from-background via-primary-light/10 via-secondary-light/5 to-accent-light/10 relative overflow-hidden">
      {/* Animated background elements for depth */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-secondary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }}></div>
      </div>

      {/* Header */}
      <header className="glass-card border-b sticky top-4 z-50 mx-4 rounded-2xl shadow-xl backdrop-blur-xl bg-white/90 dark:bg-slate-900/90 border-white/20">
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 relative z-10">
          <Card className="p-4 glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-float-slow" style={{ animationDelay: '0s' }}>
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
          
          <Card className="p-4 glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-float-slow" style={{ animationDelay: '0.2s' }}>
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
          
          <Card className="p-4 glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-float-slow" style={{ animationDelay: '0.4s' }}>
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
          
          <Card className="p-4 glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-float-slow" style={{ animationDelay: '0.6s' }}>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
          <div className="lg:col-span-2">
            <div className="opacity-0 animate-[fadeIn_0.5s_ease-in-out_forwards]">
              {activeTab === "map" && <RealTimeMapView />}
              {activeTab === "chat" && <AIAssistant />}
              {activeTab === "notifications" && <NotificationPanel />}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="p-6 glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Următoarea consultație
              </h3>
              {appointment ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{appointment.doctor_name}</p>
                      <p className="text-sm text-muted-foreground">{appointment.specialty}</p>
                    </div>
                    {appointment.appointment_date && (
                      <Badge variant="secondary">
                        {appointment.appointment_date}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm">
                    {appointment.appointment_time && (
                      <p className="text-muted-foreground">Ora: {appointment.appointment_time}</p>
                    )}
                    <p className="text-muted-foreground">{appointment.clinic_name}</p>
                  </div>
                  <Button size="sm" className="w-full">
                    Vezi detalii
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">
                    De îndată ce vei programa o consultație, informațiile vor apărea aici.
                  </p>
                </div>
              )}
            </Card>

            <Card className="p-6 glass-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-accent" />
                Medicație
              </h3>
              {medications.length > 0 ? (
                <div className="space-y-3">
                  {medications.map((med, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{med.medication_name}</p>
                        <p className="text-xs text-muted-foreground">{med.dosage}, {med.frequency}</p>
                      </div>
                      <Badge variant="outline">
                        {med.frequency.includes('dimineața') ? 'Dimineața' : 
                         med.frequency.includes('seara') ? 'Seara' : 
                         med.frequency.includes('12') ? '12:00' : 
                         med.frequency}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">
                    De îndată ce vei primi o recomandare de medicament, informațiile vor apărea aici.
                  </p>
                </div>
              )}
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
