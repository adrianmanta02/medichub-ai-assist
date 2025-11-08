import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Clock, Star, Navigation } from "lucide-react";

// Component simplu (mock) care permite acum raportarea timpului de asteptare.
// Folosește endpointul local /api/wait-times pentru a calcula media pe fiecare clinică
// și contribuie la media globală afișată în Dashboard.

// Mock data pentru clinici
const mockClinics = [
  {
    id: 1,
    name: "Clinica MedLife Calea Victoriei",
    type: "Clinică privată",
    specialty: "Medicină generală",
    waitTime: 5,
    rating: 4.8,
    distance: "1.2 km",
    address: "Calea Victoriei 123, București",
    available: true,
  },
  {
    id: 2,
    name: "Spitalul Universitar de Urgență",
    type: "Spital public",
    specialty: "Urgențe",
    waitTime: 25,
    rating: 4.2,
    distance: "2.5 km",
    address: "Splaiul Independenței 169, București",
    available: true,
  },
  {
    id: 3,
    name: "Farmacia Catena",
    type: "Farmacie",
    specialty: "Medicamente",
    waitTime: 2,
    rating: 4.6,
    distance: "0.8 km",
    address: "Bulevardul Unirii 45, București",
    available: true,
  },
  {
    id: 4,
    name: "Clinica Regina Maria",
    type: "Clinică privată",
    specialty: "Pediatrie",
    waitTime: 10,
    rating: 4.9,
    distance: "3.1 km",
    address: "Strada Aviației 89, București",
    available: true,
  },
];

interface WaitTimeEntry {
  clinicId: number;
  waitMinutes: number;
  averageWaitTime?: number | null;
}

const MapView = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClinic, setSelectedClinic] = useState(mockClinics[0]);
  const [waitTimeInput, setWaitTimeInput] = useState<{ [key: number]: string }>({});
  const [clinicAverages, setClinicAverages] = useState<{ [key: number]: number }>(() => {
    const init: { [key: number]: number } = {};
    for (const c of mockClinics) init[c.id] = c.waitTime;
    return init;
  });
  const [globalAverage, setGlobalAverage] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<{ [key: number]: boolean }>({});

  const filteredClinics = mockClinics.map(c => ({
    ...c,
    waitTime: clinicAverages[c.id] ?? c.waitTime,
  })).filter(
    (clinic) =>
      clinic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      clinic.specialty.toLowerCase().includes(searchTerm.toLowerCase())
  );

  async function refreshGlobalAverage() {
    try {
      const r = await fetch('http://localhost:3001/api/wait-times');
      if (r.ok) {
        const data = await r.json();
        if (typeof data.globalAverageWaitTime === 'number') {
          setGlobalAverage(data.globalAverageWaitTime);
        }
      }
    } catch (e) {
      // silently ignore for mock
    }
  }

  useEffect(() => {
    refreshGlobalAverage();
    const id = setInterval(refreshGlobalAverage, 30000);
    return () => clearInterval(id);
  }, []);

  async function reportWaitTime(clinicId: number) {
    const raw = waitTimeInput[clinicId];
    if (!raw) return;
    const minutes = parseInt(raw, 10);
    if (isNaN(minutes) || minutes <= 0 || minutes > 240) return;
    setSubmitting(prev => ({ ...prev, [clinicId]: true }));
    try {
      const r = await fetch('http://localhost:3001/api/wait-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: String(clinicId), waitMinutes: minutes })
      });
      if (r.ok) {
        const data = await r.json();
        setClinicAverages(prev => ({ ...prev, [clinicId]: data.averageWaitTime ?? minutes }));
        setWaitTimeInput(prev => ({ ...prev, [clinicId]: '' }));
        refreshGlobalAverage();
      }
    } catch (e) {
      // ignore errors in mock context
    } finally {
      setSubmitting(prev => ({ ...prev, [clinicId]: false }));
    }
  }

  return (
    <Card className="glass-card overflow-hidden">
      {/* Search Bar */}
      <div className="p-4 border-b bg-card/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Caută clinici, spitale sau farmacii..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Map Placeholder */}
      <div className="relative h-[400px] bg-gradient-to-br from-primary-light/20 to-accent-light/20">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-4">
            <MapPin className="w-16 h-16 mx-auto text-primary animate-bounce" />
            <p className="text-muted-foreground">Hartă interactivă</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Aici va fi integrată harta Leaflet/Mapbox cu locațiile reale ale clinicilor
            </p>
          </div>
        </div>
        
        {/* Mock pins on map */}
        <div className="absolute top-1/4 left-1/3 w-8 h-8 bg-primary rounded-full flex items-center justify-center animate-pulse-glow cursor-pointer">
          <MapPin className="w-5 h-5 text-white" />
        </div>
        <div className="absolute top-2/3 right-1/3 w-8 h-8 bg-secondary rounded-full flex items-center justify-center animate-pulse-glow cursor-pointer">
          <MapPin className="w-5 h-5 text-white" />
        </div>
        <div className="absolute bottom-1/4 left-1/2 w-8 h-8 bg-accent rounded-full flex items-center justify-center animate-pulse-glow cursor-pointer">
          <MapPin className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* Clinic List + Raportare timp așteptare */}
      <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
        {filteredClinics.map((clinic) => {
          const currentInput = waitTimeInput[clinic.id] || '';
          const disabled = submitting[clinic.id] === true;
          return (
            <div
              key={clinic.id}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                selectedClinic.id === clinic.id
                  ? "border-primary bg-primary-light/10"
                  : "border-border hover:border-primary/50"
              }`}
              onClick={() => setSelectedClinic(clinic)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h4 className="font-semibold">{clinic.name}</h4>
                  <p className="text-sm text-muted-foreground">{clinic.specialty}</p>
                </div>
                <Badge variant="outline" className="ml-2">
                  {clinic.type}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className={clinic.waitTime < 10 ? "text-secondary font-medium" : "text-muted-foreground"}>
                    {clinic.waitTime} min
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                  <span>{clinic.rating}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Navigation className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{clinic.distance}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-2">{clinic.address}</p>

              <div className="mt-3 flex gap-2">
                <Button size="sm" className="flex-1">
                  Programează
                </Button>
                <Button size="sm" variant="outline">
                  Navigare
                </Button>
              </div>

              {/* Raportare timp */}
              <div className="mt-4 pt-3 border-t">
                <p className="text-xs font-medium mb-2">Introdu timpul tău de așteptare (minute):</p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={240}
                    placeholder="ex: 12"
                    value={currentInput}
                    onChange={(e) => {
                      e.stopPropagation();
                      setWaitTimeInput(prev => ({ ...prev, [clinic.id]: e.target.value }));
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 text-sm w-20"
                  />
                  <Button
                    size="sm"
                    disabled={disabled || !currentInput || parseInt(currentInput) <= 0 || parseInt(currentInput) > 240}
                    onClick={(e) => {
                      e.stopPropagation();
                      reportWaitTime(clinic.id);
                    }}
                    className="h-8"
                  >
                    {disabled ? '...' : 'Trimite'}
                  </Button>
                  {globalAverage !== null && (
                    <div className="flex items-center text-xs text-muted-foreground pl-2">
                      Medie globală: <span className="ml-1 font-semibold">{globalAverage} min</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default MapView;
