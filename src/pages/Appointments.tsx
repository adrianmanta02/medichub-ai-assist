import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, MapPin, User, Stethoscope, Building2, Trash2, Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Appointment {
  id: string;
  doctor_name: string;
  specialty: string;
  clinic_name: string;
  appointment_date: string | null;
  appointment_time: string | null;
  notes: string | null;
  created_at: string;
}

const Appointments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null);

  useEffect(() => {
    loadAppointments();
    
    // Subscribe to real-time changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        loadAppointments();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadAppointments = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Load all appointments
      const { data, error } = await supabase
        .from("user_appointments" as any)
        .select("*")
        .eq("user_id", session.user.id)
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true });

      if (error) throw error;

      // Filter out past appointments
      const upcomingAppointments = (data || []).filter((apt: any) => {
        if (!apt.appointment_date) return true; // Keep appointments without date
        
        const appointmentDate = new Date(apt.appointment_date);
        appointmentDate.setHours(0, 0, 0, 0);
        
        // If appointment has time, check if it's today and past the time
        if (apt.appointment_time) {
          const [hours, minutes] = apt.appointment_time.split(':').map(Number);
          const appointmentDateTime = new Date(apt.appointment_date);
          appointmentDateTime.setHours(hours, minutes, 0, 0);
          
          return appointmentDateTime >= new Date();
        }
        
        // If no time, check if date is today or future
        return appointmentDate >= today;
      });

      setAppointments(upcomingAppointments as unknown as Appointment[]);

      // Delete past appointments automatically
      const pastAppointments = (data || []).filter((apt: any) => {
        if (!apt.appointment_date) return false;
        
        const appointmentDate = new Date(apt.appointment_date);
        appointmentDate.setHours(0, 0, 0, 0);
        
        if (apt.appointment_time) {
          const [hours, minutes] = apt.appointment_time.split(':').map(Number);
          const appointmentDateTime = new Date(apt.appointment_date);
          appointmentDateTime.setHours(hours, minutes, 0, 0);
          
          return appointmentDateTime < new Date();
        }
        
        return appointmentDate < today;
      });

      if (pastAppointments.length > 0) {
        // Delete past appointments
        const idsToDelete = pastAppointments.map((apt: any) => apt.id);
        const { error: deleteError } = await supabase
          .from("user_appointments" as any)
          .delete()
          .in("id", idsToDelete);

        if (deleteError) {
          console.error("Error deleting past appointments:", deleteError);
        } else {
          console.log(`Deleted ${pastAppointments.length} past appointment(s)`);
        }
      }
    } catch (error: any) {
      toast({
        title: "Eroare",
        description: error.message || "Nu s-au putut încărca consultațiile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("user_appointments" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Consultație ștearsă",
        description: "Consultația a fost ștearsă cu succes",
      });

      loadAppointments();
      setDeleteDialogOpen(false);
      setAppointmentToDelete(null);
    } catch (error: any) {
      toast({
        title: "Eroare",
        description: error.message || "Nu s-a putut șterge consultația",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Data nespecificată";
    const date = new Date(dateString);
    return date.toLocaleDateString('ro-RO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (timeString: string | null) => {
    if (!timeString) return null;
    return timeString.substring(0, 5); // Format: HH:MM
  };

  const getDaysUntil = (dateString: string | null) => {
    if (!dateString) return null;
    const appointmentDate = new Date(dateString);
    appointmentDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = appointmentDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary-light/10 via-secondary-light/5 to-accent-light/10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Se încarcă consultațiile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary-light/10 via-secondary-light/5 to-accent-light/10 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Consultațiile mele</h1>
              <p className="text-muted-foreground">Gestionează programările tale medicale</p>
            </div>
          </div>
        </div>

        {/* Appointments List */}
        {appointments.length === 0 ? (
          <Card className="p-12 glass-card text-center">
            <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">Nu ai consultații programate</h3>
            <p className="text-muted-foreground mb-6">
              Consultațiile trecute sunt eliminate automat. Poți programa o consultație prin AI Asistent.
            </p>
            <Button onClick={() => navigate("/dashboard")}>
              Mergi la Dashboard
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {appointments.map((appointment) => {
              const daysUntil = getDaysUntil(appointment.appointment_date);
              const isToday = daysUntil === 0;
              const isTomorrow = daysUntil === 1;

              return (
                <Card key={appointment.id} className="p-6 glass-card hover:shadow-xl transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Stethoscope className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold">{appointment.doctor_name}</h3>
                            {isToday && (
                              <Badge variant="destructive" className="text-xs">
                                Astăzi
                              </Badge>
                            )}
                            {isTomorrow && (
                              <Badge variant="default" className="text-xs">
                                Mâine
                              </Badge>
                            )}
                            {daysUntil !== null && daysUntil !== 0 && daysUntil !== 1 && daysUntil > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                În {daysUntil} zile
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{appointment.specialty}</p>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4 mt-4">
                        <div className="flex items-start gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground">Clinică</p>
                            <p className="text-sm font-medium">{appointment.clinic_name}</p>
                          </div>
                        </div>

                        {appointment.appointment_date && (
                          <div className="flex items-start gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-xs text-muted-foreground">Data</p>
                              <p className="text-sm font-medium">{formatDate(appointment.appointment_date)}</p>
                            </div>
                          </div>
                        )}

                        {appointment.appointment_time && (
                          <div className="flex items-start gap-2">
                            <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-xs text-muted-foreground">Ora</p>
                              <p className="text-sm font-medium">{formatTime(appointment.appointment_time)}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {appointment.notes && (
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Note</p>
                          <p className="text-sm">{appointment.notes}</p>
                        </div>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-4 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setAppointmentToDelete(appointment.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Info Card */}
        <Card className="mt-6 p-4 glass-card bg-accent-light/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-accent mt-0.5" />
            <div>
              <p className="text-sm font-medium mb-1">Informații</p>
              <p className="text-xs text-muted-foreground">
                Consultațiile care au trecut de data programată sunt eliminate automat din listă. 
                Poți programa consultații noi prin intermediul AI Asistentului din Dashboard.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Șterge consultația?</AlertDialogTitle>
            <AlertDialogDescription>
              Ești sigur că vrei să ștergi această consultație? Această acțiune nu poate fi anulată.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAppointmentToDelete(null)}>
              Anulează
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => appointmentToDelete && handleDelete(appointmentToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Șterge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Appointments;

