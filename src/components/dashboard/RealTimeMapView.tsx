import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Clock, Star, Navigation, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface Clinic {
  id: string;
  name: string;
  type: string;
  specialties: string[];
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  average_rating: number;
  price_range: string;
  accepts_emergencies: boolean;
  wait_time?: number;
}

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

const RealTimeMapView = () => {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number]>([44.4268, 26.1025]); // Bucharest center
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }

    fetchClinics();
    
    // Realtime subscription for wait times
    const channel = supabase
      .channel('wait_times_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wait_times'
        },
        () => {
          fetchClinics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchClinics = async () => {
    try {
      const { data: clinicsData, error } = await supabase
        .from('clinics')
        .select(`
          *,
          wait_times(wait_minutes, created_at)
        `)
        .order('created_at', { foreignTable: 'wait_times', ascending: false });

      if (error) throw error;

      const clinicsWithWaitTime = clinicsData?.map((clinic: any) => {
        const recentWaitTimes = clinic.wait_times
          ?.filter((wt: any) => {
            const hoursAgo = (Date.now() - new Date(wt.created_at).getTime()) / (1000 * 60 * 60);
            return hoursAgo < 2;
          })
          .map((wt: any) => wt.wait_minutes) || [];

        const avgWaitTime = recentWaitTimes.length > 0
          ? Math.round(recentWaitTimes.reduce((a: number, b: number) => a + b, 0) / recentWaitTimes.length)
          : 15;

        return {
          ...clinic,
          wait_time: avgWaitTime,
        };
      }) || [];

      setClinics(clinicsWithWaitTime);
      if (clinicsWithWaitTime.length > 0 && !selectedClinic) {
        setSelectedClinic(clinicsWithWaitTime[0]);
      }
    } catch (error: any) {
      toast({
        title: "Eroare",
        description: "Nu s-au putut încărca clinicile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredClinics = clinics.filter(
    (clinic) =>
      clinic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      clinic.specialties.some(s => s.toLowerCase().includes(searchTerm.toLowerCase())) ||
      clinic.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const reportWaitTime = async (clinicId: string, waitMinutes: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Autentificare necesară",
          description: "Trebuie să fii autentificat pentru a raporta timpul de așteptare",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('wait_times')
        .insert({
          clinic_id: clinicId,
          wait_minutes: waitMinutes,
          reported_by: session.user.id,
        });

      if (error) throw error;

      toast({
        title: "Mulțumim!",
        description: "Timpul de așteptare a fost raportat cu succes",
      });
    } catch (error: any) {
      toast({
        title: "Eroare",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getMarkerColor = (clinic: Clinic) => {
    if (clinic.wait_time && clinic.wait_time < 10) return "green";
    if (clinic.wait_time && clinic.wait_time < 30) return "orange";
    return "red";
  };

  if (loading) {
    return (
      <Card className="glass-card p-8 text-center">
        <p>Se încarcă harta...</p>
      </Card>
    );
  }

  return (
    <Card className="glass-card overflow-hidden">
      <div className="p-4 border-b bg-card/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Caută clinici, specialități..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="h-[400px] relative">
        <MapContainer
          center={userLocation}
          zoom={13}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RecenterMap center={userLocation} />
          
          {filteredClinics.map((clinic) => (
            <Marker
              key={clinic.id}
              position={[clinic.latitude, clinic.longitude]}
              eventHandlers={{
                click: () => setSelectedClinic(clinic),
              }}
            >
              <Popup>
                <div className="p-2">
                  <h4 className="font-semibold">{clinic.name}</h4>
                  <p className="text-sm text-muted-foreground">{clinic.type}</p>
                  <p className="text-sm mt-1">Timp așteptare: {clinic.wait_time} min</p>
                  <p className="text-sm">Rating: {clinic.average_rating} ⭐</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
        {filteredClinics.map((clinic) => (
          <div
            key={clinic.id}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              selectedClinic?.id === clinic.id
                ? "border-primary bg-primary-light/10"
                : "border-border hover:border-primary/50"
            }`}
            onClick={() => setSelectedClinic(clinic)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h4 className="font-semibold">{clinic.name}</h4>
                <p className="text-sm text-muted-foreground">{clinic.specialties.join(", ")}</p>
              </div>
              <Badge variant="outline">{clinic.type}</Badge>
            </div>

            <div className="flex items-center gap-4 text-sm mb-2">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-primary" />
                <span className={clinic.wait_time && clinic.wait_time < 10 ? "text-secondary font-medium" : ""}>
                  {clinic.wait_time} min
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <span>{clinic.average_rating}</span>
              </div>
              <div className="flex items-center gap-1">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs">{clinic.phone}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mb-3">{clinic.address}</p>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`tel:${clinic.phone}`, "_self");
                }}
              >
                Sună
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${clinic.latitude},${clinic.longitude}`,
                    "_blank"
                  );
                }}
              >
                <Navigation className="w-4 h-4 mr-1" />
                Navigare
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default RealTimeMapView;
