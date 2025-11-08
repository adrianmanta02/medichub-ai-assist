import { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Clock, Star, Navigation, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import useWaitTimes from "@/hooks/useWaitTimes";
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
  const [waitTimeInput, setWaitTimeInput] = useState<{ [key: string]: string }>({});
  const { reportWaitTime, clinicAverages, globalAverage } = useWaitTimes(2);
  const { toast } = useToast();

  const fetchClinics = useCallback(async () => {
    try {
      const { data: clinicsData, error } = await supabase
        .from('clinics')
        .select('*');

      if (error) throw error;

      // Create a map of clinic averages from the hook
      const clinicAvgMap = new Map(
        clinicAverages.map(c => [c.clinic_id, c.average_wait])
      );

      const clinicsWithWaitTime = clinicsData?.map((clinic: any) => {
        // Use the average from the hook, or default to 15 if no data
        const avgWaitTime = clinicAvgMap.get(clinic.id) || 15;

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
  }, [clinicAverages, selectedClinic, toast]);

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
  }, [fetchClinics]);

  const filteredClinics = clinics.filter(
    (clinic) =>
      clinic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      clinic.specialties.some(s => s.toLowerCase().includes(searchTerm.toLowerCase())) ||
      clinic.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleReport = async (clinicId: string, waitMinutes: number) => {
    try {
      // Validate input
      if (!clinicId || !waitMinutes || waitMinutes <= 0) {
        toast({
          title: "Eroare",
          description: "Te rugăm să introduci un timp de așteptare valid",
          variant: "destructive",
        });
        return;
      }

      await reportWaitTime(clinicId, waitMinutes);
      setWaitTimeInput(prev => ({ ...prev, [clinicId]: '' }));
      await fetchClinics(); // sync per-clinic averages
      toast({
        title: "Mulțumim!",
        description: `Timpul de așteptare de ${waitMinutes} min a fost raportat cu succes`,
      });
    } catch (error: any) {
      console.error('Error reporting wait time:', error);
      const errorMessage = error?.message || error?.error?.message || "Nu s-a putut raporta timpul de așteptare";
      toast({
        title: "Eroare",
        description: errorMessage,
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
                <div className="p-2 min-w-[200px]">
                  <h4 className="font-semibold">{clinic.name}</h4>
                  <p className="text-sm text-muted-foreground">{clinic.type}</p>
                  <p className="text-sm mt-1">Timp așteptare: {clinic.wait_time} min</p>
                  <p className="text-sm">Rating: {clinic.average_rating} ⭐</p>
                  
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs font-medium mb-2">Raportează timp așteptare:</p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="min"
                        min="0"
                        max="180"
                        value={waitTimeInput[clinic.id] || ''}
                        onChange={(e) => setWaitTimeInput(prev => ({ ...prev, [clinic.id]: e.target.value }))}
                        className="h-8 text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const minutes = parseInt(waitTimeInput[clinic.id] || '0');
                          if (minutes > 0) {
                            handleReport(clinic.id, minutes);
                          }
                        }}
                        disabled={!waitTimeInput[clinic.id] || parseInt(waitTimeInput[clinic.id]) <= 0}
                        className="h-8"
                      >
                        Trimite
                      </Button>
                    </div>
                  </div>
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

            {/* Wait time reporting form */}
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-medium mb-2">Raportează timp așteptare:</p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="min"
                  min="0"
                  max="480"
                  value={waitTimeInput[clinic.id] || ''}
                  onChange={(e) => {
                    e.stopPropagation();
                    setWaitTimeInput(prev => ({ ...prev, [clinic.id]: e.target.value }));
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 text-sm flex-1"
                />
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    const minutes = parseInt(waitTimeInput[clinic.id] || '0');
                    if (minutes > 0) {
                      handleReport(clinic.id, minutes);
                    }
                  }}
                  disabled={!waitTimeInput[clinic.id] || parseInt(waitTimeInput[clinic.id] || '0') <= 0}
                  className="h-8"
                >
                  Trimite
                </Button>
              </div>
            </div>

            <div className="flex gap-2 mt-3">
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
