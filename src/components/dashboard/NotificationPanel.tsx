import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Clock, Pill, Calendar, AlertCircle, CheckCircle } from "lucide-react";

const NotificationPanel = () => {
  const notifications = [
    {
      id: 1,
      type: "appointment",
      icon: Calendar,
      title: "Consultație programată",
      description: "Dr. Popescu Maria - mâine la 10:00",
      time: "Acum 5 minute",
      priority: "high",
      read: false,
    },
    {
      id: 2,
      type: "medication",
      icon: Pill,
      title: "Reminder medicație",
      description: "Paracetamol 500mg - ora 12:00",
      time: "Acum 30 minute",
      priority: "medium",
      read: false,
    },
    {
      id: 3,
      type: "waittime",
      icon: Clock,
      title: "Timp de așteptare redus",
      description: "Clinica MedLife - doar 5 minute",
      time: "Acum 1 oră",
      priority: "low",
      read: true,
    },
    {
      id: 4,
      type: "alert",
      icon: AlertCircle,
      title: "Rezultate analize disponibile",
      description: "Analize de sânge - verifică rezultatele",
      time: "Acum 2 ore",
      priority: "high",
      read: true,
    },
    {
      id: 5,
      type: "success",
      icon: CheckCircle,
      title: "Rețetă reînnoită",
      description: "Rețeta pentru Vitamina D a fost reînnoită",
      time: "Ieri",
      priority: "low",
      read: true,
    },
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-destructive";
      case "medium":
        return "text-accent";
      default:
        return "text-secondary";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "appointment":
        return "bg-primary/10 text-primary";
      case "medication":
        return "bg-accent/10 text-accent";
      case "waittime":
        return "bg-secondary/10 text-secondary";
      case "alert":
        return "bg-destructive/10 text-destructive";
      case "success":
        return "bg-green-500/10 text-green-600";
      default:
        return "bg-muted";
    }
  };

  return (
    <Card className="glass-card">
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">Notificări</h3>
              <p className="text-sm text-muted-foreground">
                {notifications.filter((n) => !n.read).length} necitite
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm">
            Marchează tot ca citit
          </Button>
        </div>
      </div>

      <div className="divide-y max-h-[500px] overflow-y-auto">
        {notifications.map((notification) => {
          const Icon = notification.icon;
          return (
            <div
              key={notification.id}
              className={`p-4 hover:bg-muted/50 transition-colors cursor-pointer ${
                !notification.read ? "bg-primary-light/5" : ""
              }`}
            >
              <div className="flex gap-4">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${getTypeColor(
                    notification.type
                  )}`}
                >
                  <Icon className="w-6 h-6" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-semibold text-sm">{notification.title}</h4>
                    {!notification.read && (
                      <Badge variant="default" className="bg-primary">
                        Nou
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {notification.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {notification.time}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${getPriorityColor(notification.priority)}`} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t bg-muted/30">
        <Button variant="outline" className="w-full">
          Vezi toate notificările
        </Button>
      </div>
    </Card>
  );
};

export default NotificationPanel;
