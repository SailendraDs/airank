import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Mail, Phone, Camera, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState({
    userName: "",
    email: "",
    phone: "",
    profilePicture: ""
  });

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const response = await fetch('/api/users/me', {
        credentials: 'include',
      });
      if (response.ok) {
        const user = await response.json();
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        setProfile({
          userName: fullName || "User",
          email: user.email || "",
          phone: user.phone || "",
          profilePicture: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName || 'User')}&size=128`
        });
      }
    } catch (error) {
      console.error("Failed to fetch user profile:", error);
      toast({ title: "Error loading profile", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setProfile({ ...profile, profilePicture: e.target?.result as string });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight flex items-center gap-2">
          <User className="h-8 w-8 text-primary" />
          Profile
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your personal account information.
        </p>
      </div>

      <Card className="glass-card" data-testid="card-profile">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Update your profile details and contact information.</CardDescription>
            </div>
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)} disabled={isLoading} data-testid="btn-edit-profile">
                Edit Profile
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsEditing(false)} data-testid="btn-cancel-profile">
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving} data-testid="btn-save-profile">
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                <AvatarImage src={profile.profilePicture} />
                <AvatarFallback className="text-2xl">
                  {profile.userName.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              {isEditing && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full shadow-md"
                  onClick={handleImageUpload}
                  data-testid="btn-upload-photo"
                >
                  <Camera className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold">{profile.userName}</h3>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
            </div>
          </div>

          <div className="grid gap-4 pt-4 border-t">
            <div className="grid gap-2">
              <Label htmlFor="userName" className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                User Name
              </Label>
              <Input
                id="userName"
                value={profile.userName}
                onChange={(e) => setProfile({ ...profile, userName: e.target.value })}
                disabled={!isEditing}
                placeholder="Enter your full name"
                data-testid="input-username"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                disabled={!isEditing}
                placeholder="Enter your email"
                data-testid="input-email"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                Phone Number
              </Label>
              <Input
                id="phone"
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                disabled={!isEditing}
                placeholder="Enter your phone number"
                data-testid="input-phone"
              />
            </div>
          </div>

          {isEditing && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <p>Changes to your email or phone number may require verification before they take effect.</p>
            </div>
          )}
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
