import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Edit2, Eye, EyeOff, Lock, User, Mail, Phone, MapPin, Calendar, CreditCard, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { maskCNP, maskAddress, maskPhone, maskEmail } from "@/utils/maskSensitiveData";

interface ProfileData {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  cnp: string | null;
  birth_date: string | null;
  address: string | null;
  blood_type: string | null;
  allergies: string[] | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
}

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    full_name: null,
    email: null,
    phone: null,
    cnp: null,
    birth_date: null,
    address: null,
    blood_type: null,
    allergies: null,
    emergency_contact: null,
    emergency_phone: null,
  });
  const [editedProfile, setEditedProfile] = useState<ProfileData>({ ...profile });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setProfile(data);
        setEditedProfile(data);
      } else {
        // Create empty profile if doesn't exist
        const { data: newProfile, error: createError } = await supabase
          .from("profiles")
          .insert({
            user_id: session.user.id,
            email: session.user.email,
          })
          .select()
          .single();

        if (createError) throw createError;
        if (newProfile) {
          setProfile(newProfile);
          setEditedProfile(newProfile);
        }
      }
    } catch (error: any) {
      toast({
        title: "Eroare",
        description: error.message || "Nu s-a putut încărca profilul",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          ...editedProfile,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", session.user.id);

      if (error) throw error;

      setProfile(editedProfile);
      setIsEditing(false);
      toast({
        title: "Profil actualizat!",
        description: "Datele tale au fost salvate cu succes",
      });
    } catch (error: any) {
      toast({
        title: "Eroare",
        description: error.message || "Nu s-a putut salva profilul",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedProfile({ ...profile });
    setIsEditing(false);
  };

  const updateField = (field: keyof ProfileData, value: any) => {
    setEditedProfile(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary-light/10 via-secondary-light/5 to-accent-light/10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Se încarcă profilul...</p>
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
              <h1 className="text-3xl font-bold">Profilul meu</h1>
              <p className="text-muted-foreground">Gestionează datele tale personale</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSensitive(!showSensitive)}
            >
              {showSensitive ? (
                <>
                  <EyeOff className="w-4 h-4 mr-2" />
                  Ascunde date sensibile
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Afișează date sensibile
                </>
              )}
            </Button>
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)}>
                <Edit2 className="w-4 h-4 mr-2" />
                Editează
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel}>
                  Anulează
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Se salvează..." : "Salvează"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Profile Cards */}
        <div className="grid gap-6">
          {/* Informații personale */}
          <Card className="p-6 glass-card">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Informații personale</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="full_name">Nume complet</Label>
                {isEditing ? (
                  <Input
                    id="full_name"
                    value={editedProfile.full_name || ''}
                    onChange={(e) => updateField('full_name', e.target.value)}
                    placeholder="Nume complet"
                  />
                ) : (
                  <p className="text-sm font-medium mt-1">
                    {profile.full_name || "Nu este completat"}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="email">
                  <Mail className="w-4 h-4 inline mr-1" />
                  Email
                </Label>
                {isEditing ? (
                  <Input
                    id="email"
                    type="email"
                    value={editedProfile.email || ''}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="email@example.com"
                  />
                ) : (
                  <p className="text-sm font-medium mt-1">
                    {showSensitive ? profile.email : maskEmail(profile.email)}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="phone">
                  <Phone className="w-4 h-4 inline mr-1" />
                  Telefon
                </Label>
                {isEditing ? (
                  <Input
                    id="phone"
                    type="tel"
                    value={editedProfile.phone || ''}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="0712345678"
                  />
                ) : (
                  <p className="text-sm font-medium mt-1">
                    {showSensitive ? profile.phone : maskPhone(profile.phone)}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="birth_date">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Data nașterii
                </Label>
                {isEditing ? (
                  <Input
                    id="birth_date"
                    type="date"
                    value={editedProfile.birth_date || ''}
                    onChange={(e) => updateField('birth_date', e.target.value)}
                  />
                ) : (
                  <p className="text-sm font-medium mt-1">
                    {profile.birth_date ? new Date(profile.birth_date).toLocaleDateString('ro-RO') : "Nu este completat"}
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Date din buletin */}
          <Card className="p-6 glass-card">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Date din buletin</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cnp">
                  <Shield className="w-4 h-4 inline mr-1" />
                  CNP
                </Label>
                {isEditing ? (
                  <Input
                    id="cnp"
                    value={editedProfile.cnp || ''}
                    onChange={(e) => updateField('cnp', e.target.value)}
                    placeholder="1234567890123"
                    maxLength={13}
                  />
                ) : (
                  <p className="text-sm font-medium mt-1">
                    {showSensitive ? profile.cnp : maskCNP(profile.cnp)}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="address">
                  <MapPin className="w-4 h-4 inline mr-1" />
                  Adresă
                </Label>
                {isEditing ? (
                  <Input
                    id="address"
                    value={editedProfile.address || ''}
                    onChange={(e) => updateField('address', e.target.value)}
                    placeholder="Str. Exemplu, Nr. 10, București"
                  />
                ) : (
                  <p className="text-sm font-medium mt-1">
                    {showSensitive ? profile.address : maskAddress(profile.address)}
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Informații medicale */}
          <Card className="p-6 glass-card">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Informații medicale</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="blood_type">Grupă sanguină</Label>
                {isEditing ? (
                  <Input
                    id="blood_type"
                    value={editedProfile.blood_type || ''}
                    onChange={(e) => updateField('blood_type', e.target.value)}
                    placeholder="A+, B-, O+, etc."
                  />
                ) : (
                  <p className="text-sm font-medium mt-1">
                    {profile.blood_type || "Nu este completat"}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="allergies">Alergii</Label>
                {isEditing ? (
                  <Input
                    id="allergies"
                    value={editedProfile.allergies?.join(', ') || ''}
                    onChange={(e) => updateField('allergies', e.target.value.split(',').map(a => a.trim()).filter(a => a))}
                    placeholder="Polen, Penicilină, etc."
                  />
                ) : (
                  <p className="text-sm font-medium mt-1">
                    {profile.allergies && profile.allergies.length > 0
                      ? profile.allergies.join(', ')
                      : "Nu sunt alergii înregistrate"}
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Contact de urgență */}
          <Card className="p-6 glass-card">
            <div className="flex items-center gap-2 mb-4">
              <Phone className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Contact de urgență</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="emergency_contact">Nume contact</Label>
                {isEditing ? (
                  <Input
                    id="emergency_contact"
                    value={editedProfile.emergency_contact || ''}
                    onChange={(e) => updateField('emergency_contact', e.target.value)}
                    placeholder="Nume complet"
                  />
                ) : (
                  <p className="text-sm font-medium mt-1">
                    {profile.emergency_contact || "Nu este completat"}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="emergency_phone">Telefon contact</Label>
                {isEditing ? (
                  <Input
                    id="emergency_phone"
                    type="tel"
                    value={editedProfile.emergency_phone || ''}
                    onChange={(e) => updateField('emergency_phone', e.target.value)}
                    placeholder="0712345678"
                  />
                ) : (
                  <p className="text-sm font-medium mt-1">
                    {showSensitive ? profile.emergency_phone : maskPhone(profile.emergency_phone)}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Profile;

