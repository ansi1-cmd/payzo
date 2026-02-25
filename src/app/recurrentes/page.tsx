"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecurringForm } from "@/components/recurring-form";
import { CategoryIcon } from "@/components/category-icon";
import { formatCurrency } from "@/lib/format";
import { Plus, Pencil, Trash2, CalendarPlus, Power } from "lucide-react";

interface RecurringExpense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  categoryId: string;
  dayOfMonth: number;
  active: boolean;
  notes: string | null;
  category: { id: string; name: string; icon: string; color: string };
}

export default function RecurrentesPage() {
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchRecurring = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/recurring");
    const json = await res.json();
    setRecurring(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRecurring();
  }, [fetchRecurring]);

  const toggleActive = async (item: RecurringExpense) => {
    await fetch(`/api/recurring/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    fetchRecurring();
  };

  const deleteRecurring = async (id: string) => {
    await fetch(`/api/recurring/${id}`, { method: "DELETE" });
    fetchRecurring();
  };

  const generateExpenses = async () => {
    setGenerating(true);
    const now = new Date();
    const res = await fetch("/api/recurring/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      }),
    });
    const json = await res.json();
    alert(json.message);
    setGenerating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gastos Recurrentes</h1>
          <p className="text-sm text-muted-foreground">
            Gastos que se repiten todos los meses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={generateExpenses} disabled={generating}>
            <CalendarPlus className="h-4 w-4 mr-2" />
            {generating ? "Generando..." : "Generar mes actual"}
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-12 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : recurring.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">
              No hay gastos recurrentes configurados
            </p>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar gasto recurrente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {recurring.map((item) => (
            <Card key={item.id} className={!item.active ? "opacity-50" : ""}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center w-10 h-10 rounded-full"
                    style={{
                      backgroundColor: item.category.color + "20",
                    }}
                  >
                    <CategoryIcon
                      icon={item.category.icon}
                      className="h-5 w-5"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item.description}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {item.category.name}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        Dia {item.dayOfMonth}
                      </Badge>
                      {!item.active && (
                        <Badge variant="secondary" className="text-xs">
                          Inactivo
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2">
                    <p className="text-sm font-semibold">
                      {formatCurrency(item.amount, item.currency)}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {item.currency}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleActive(item)}
                    title={item.active ? "Desactivar" : "Activar"}
                  >
                    <Power
                      className={`h-4 w-4 ${item.active ? "text-green-500" : "text-muted-foreground"}`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditing(item);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteRecurring(item.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RecurringForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={fetchRecurring}
        recurring={editing}
      />
    </div>
  );
}
