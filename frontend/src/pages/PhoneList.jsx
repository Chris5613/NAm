import { Card, CardContent } from "@/components/ui/card";
import { Phone } from "lucide-react";

export default function PhoneList() {
  return (
    <div className="space-y-6" data-testid="phone-list-page">
      <h1 className="text-4xl font-medium tracking-tight">Unity Phone List</h1>
      <Card className="border-border/40 bg-card">
        <CardContent className="p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
          <Phone className="w-10 h-10 text-muted-foreground mb-4" strokeWidth={1.5} />
          <p className="text-muted-foreground text-sm">
            Unity phone list coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
