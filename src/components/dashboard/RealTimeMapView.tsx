import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from "react-leaflet";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Clock, Star, Navigation, Phone, AlertCircle, Loader2 } from "lucide-react";
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

// Create green medical facility icon function
const createGreenMedicalIcon = () => {
  return L.divIcon({
    className: 'custom-medical-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        position: relative;
      ">
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(45deg);
          width: 12px;
          height: 12px;
          background: white;
          border-radius: 50%;
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

// Create user location marker icon - larger and more visible
const createUserLocationIcon = () => {
  return L.divIcon({
    className: 'user-location-marker',
    html: `
      <div style="
        width: 40px;
        height: 40px;
        background: #3b82f6;
        border: 4px solid white;
        border-radius: 50%;
        box-shadow: 0 4px 16px rgba(59, 130, 246, 0.6), 0 0 0 8px rgba(59, 130, 246, 0.2);
        position: relative;
        animation: pulse 2s infinite;
      ">
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 16px;
          height: 16px;
          background: white;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        "></div>
      </div>
      <style>
        @keyframes pulse {
          0% {
            box-shadow: 0 4px 16px rgba(59, 130, 246, 0.6), 0 0 0 8px rgba(59, 130, 246, 0.2);
          }
          50% {
            box-shadow: 0 4px 16px rgba(59, 130, 246, 0.8), 0 0 0 12px rgba(59, 130, 246, 0.1);
          }
          100% {
            box-shadow: 0 4px 16px rgba(59, 130, 246, 0.6), 0 0 0 8px rgba(59, 130, 246, 0.2);
          }
        }
      </style>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
};

// Route interface
interface Route {
  coordinates: [number, number][];
  distance: number; // in meters
  duration: number; // in seconds
}

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
  
  // Location tracking state
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const locationRequestedRef = useRef(false);

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

  // Simple initialization - just fetch clinics, don't check permissions upfront
  useEffect(() => {
    fetchClinics();
  }, [fetchClinics]);

  // Calculate route using OSRM routing service
  const calculateRoute = useCallback(async (start: [number, number], destination: Clinic) => {
    setRouteLoading(true);
    setRouteError(null);
    
    try {
      // Use OSRM routing service (free and open source)
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
      
      const response = await fetch(osrmUrl);
      if (!response.ok) {
        throw new Error('Route calculation failed');
      }
      
      const data = await response.json();
      
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const routeData = data.routes[0];
        const coordinates = routeData.geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]] as [number, number]);
        
        setRoute({
          coordinates,
          distance: routeData.distance, // meters
          duration: routeData.duration, // seconds
        });
      } else {
        throw new Error('No route found');
      }
    } catch (error: any) {
      console.error('Route calculation error:', error);
      setRouteError(error.message || 'Nu s-a putut calcula ruta');
      setRoute(null);
      toast({
        title: "Eroare la calcularea rutei",
        description: "Nu s-a putut găsi o rută către destinație",
        variant: "destructive",
      });
    } finally {
      setRouteLoading(false);
    }
  }, [toast]);

  // Request location and start tracking - simplified approach
  const requestLocation = useCallback(() => {
    // Prevent multiple simultaneous requests
    if (locationRequestedRef.current) {
      return;
    }
    locationRequestedRef.current = true;

    // Check if geolocation is available
    if (!navigator.geolocation) {
      toast({
        title: "Locația nu este disponibilă",
        description: "Browser-ul tău nu suportă geolocation",
        variant: "destructive",
      });
      locationRequestedRef.current = false;
      return;
    }

    console.log('[Location] Requesting location...');

    // Direct approach: try to get location immediately
    // Browser will prompt user if needed
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('[Location] Location obtained:', position.coords);
        const newLocation: [number, number] = [position.coords.latitude, position.coords.longitude];
        setUserLocation(newLocation);
        setLocationPermission('granted');
        setIsTrackingLocation(true);
        locationRequestedRef.current = false;
        
        toast({
          title: "Locația activată",
          description: "Tracking-ul locației este activ",
          duration: 3000,
        });
        
        // Start watching position for real-time updates
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
        
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const updatedLocation: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            setUserLocation(updatedLocation);
            console.log('[Location] Location updated:', updatedLocation);
            
            // Recalculate route if clinic is selected
            setSelectedClinic((currentClinic) => {
              if (currentClinic && route) {
                calculateRoute(updatedLocation, currentClinic);
              }
              return currentClinic;
            });
          },
          (error) => {
            console.error('[Location] Watch error:', error);
            if (error.code === GeolocationPositionError.PERMISSION_DENIED) {
              setLocationPermission('denied');
              setIsTrackingLocation(false);
              locationRequestedRef.current = false;
              toast({
                title: "Permisiune refuzată",
                description: "Te rugăm să permiți accesul la locație în setările browserului",
                variant: "destructive",
              });
            } else if (error.code === GeolocationPositionError.TIMEOUT) {
              console.warn('[Location] Watch timeout - continuing anyway');
            }
          },
          {
            enableHighAccuracy: false, // Use less battery
            timeout: 15000,
            maximumAge: 10000 // Accept cached position up to 10 seconds old
          }
        );
      },
      (error) => {
        console.error('[Location] GetCurrentPosition error:', error);
        locationRequestedRef.current = false;
        
        if (error.code === GeolocationPositionError.PERMISSION_DENIED) {
          setLocationPermission('denied');
          toast({
            title: "Permisiune refuzată",
            description: "Click pe iconița de locație din bara de adresă și selectează 'Permite'",
            variant: "destructive",
            duration: 6000,
          });
        } else if (error.code === GeolocationPositionError.POSITION_UNAVAILABLE) {
          setLocationPermission('denied');
          toast({
            title: "Locația indisponibilă",
            description: "Nu s-a putut determina locația. Verifică setările de locație ale dispozitivului.",
            variant: "destructive",
          });
        } else if (error.code === GeolocationPositionError.TIMEOUT) {
          toast({
            title: "Timeout",
            description: "Obținerea locației durează prea mult. Te rugăm să reîncerci.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Eroare locație",
            description: "Nu s-a putut obține locația. Te rugăm să reîncerci.",
            variant: "destructive",
          });
        }
      },
      {
        timeout: 15000,
        enableHighAccuracy: false, // Faster, less battery
        maximumAge: 60000 // Accept cached position up to 1 minute old
      }
    );
  }, [calculateRoute, route, toast]);

  // Stop location tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTrackingLocation(false);
    locationRequestedRef.current = false;
    console.log('[Location] Tracking stopped');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  // Handle clinic marker click - calculate route
  const handleClinicClick = useCallback((clinic: Clinic) => {
    setSelectedClinic(clinic);
    
    // If location is available and tracking is active, calculate route
    if (userLocation && isTrackingLocation) {
      calculateRoute(userLocation, clinic);
    } else if (!isTrackingLocation) {
      // Request location first, then calculate route
      requestLocation();
      // Wait a bit for location to be obtained, then calculate route
      const checkLocation = setInterval(() => {
        if (userLocation && isTrackingLocation) {
          calculateRoute(userLocation, clinic);
          clearInterval(checkLocation);
        }
      }, 500);
      
      // Clear interval after 10 seconds if location not obtained
      setTimeout(() => clearInterval(checkLocation), 10000);
    }
  }, [userLocation, isTrackingLocation, calculateRoute, requestLocation]);

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

  // Create green medical icon for all markers (consistent green for all medical facilities)
  const medicalIcon = useMemo(() => createGreenMedicalIcon(), []);

  if (loading) {
    return (
      <Card className="glass-card p-8 text-center">
        <p>Se încarcă harta...</p>
      </Card>
    );
  }

  return (
    <Card className="glass-card overflow-hidden">
      <div className="p-4 border-b bg-card/50 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Caută clinici, specialități..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {/* Location controls */}
        <div className="flex items-center gap-2">
          {isTrackingLocation ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={stopTracking}
                className="flex items-center gap-2"
              >
                <MapPin className="w-4 h-4 text-green-500" />
                Tracking activ
              </Button>
              {route && selectedClinic && (
                <div className="flex items-center gap-2 text-sm px-3 py-1 bg-primary/10 rounded-md">
                  <Navigation className="w-4 h-4 text-primary" />
                  <span className="font-medium">{(route.distance / 1000).toFixed(1)} km</span>
                  <span className="text-muted-foreground">~{Math.round(route.duration / 60)} min</span>
                </div>
              )}
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={requestLocation}
              className="flex items-center gap-2"
              disabled={locationRequestedRef.current}
            >
              <MapPin className="w-4 h-4" />
              {locationRequestedRef.current ? 'Se obține locația...' : 'Activează locația'}
            </Button>
          )}
          {locationPermission === 'denied' && !isTrackingLocation && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="w-3 h-3" />
              <span>Click pe iconița de locație din bara de adresă pentru a permite</span>
            </div>
          )}
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
          
          {/* User location marker - always visible when tracking is active */}
          {isTrackingLocation && userLocation && (
            <Marker
              position={userLocation}
              icon={createUserLocationIcon()}
              zIndexOffset={1000}
            >
              <Popup>
                <div className="p-2">
                  <h4 className="font-semibold">📍 Locația ta</h4>
                  <p className="text-xs text-muted-foreground">
                    Tracking activ
                  </p>
                  <p className="text-xs mt-1">
                    Lat: {userLocation[0].toFixed(6)}
                  </p>
                  <p className="text-xs">
                    Lng: {userLocation[1].toFixed(6)}
                  </p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Route polyline */}
          {route && route.coordinates.length > 0 && (
            <Polyline
              positions={route.coordinates}
              pathOptions={{
                color: '#3b82f6',
                weight: 5,
                opacity: 0.7,
                dashArray: '10, 5'
              }}
            />
          )}

          {filteredClinics.map((clinic) => (
            <Marker
              key={clinic.id}
              position={[clinic.latitude, clinic.longitude]}
              icon={medicalIcon}
              eventHandlers={{
                click: () => handleClinicClick(clinic),
              }}
            >
              <Popup>
                <div className="p-2 min-w-[200px]">
                  <h4 className="font-semibold">{clinic.name}</h4>
                  <p className="text-sm text-muted-foreground">{clinic.type}</p>
                  <p className="text-sm mt-1">Timp așteptare: {clinic.wait_time} min</p>
                  <p className="text-sm">Rating: {clinic.average_rating} ⭐</p>
                  
                  {/* Route info */}
                  {selectedClinic?.id === clinic.id && route && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2 text-sm">
                        <Navigation className="w-4 h-4 text-primary" />
                        <div>
                          <p className="font-medium">
                            {(route.distance / 1000).toFixed(1)} km
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ~{Math.round(route.duration / 60)} min
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {selectedClinic?.id === clinic.id && routeLoading && (
                    <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Se calculează ruta...</span>
                    </div>
                  )}
                  
                  {selectedClinic?.id === clinic.id && routeError && (
                    <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-xs">{routeError}</span>
                    </div>
                  )}
                  
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
