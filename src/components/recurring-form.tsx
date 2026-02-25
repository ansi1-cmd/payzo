"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryIcon } from "@/components/category-icon";

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface RecurringFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  recurring?: {
    id: string;
    description: string;
    amount: number;
    currency: string;
    categoryId: string;
    dayOfMonth: number;
    notes: string | null;
  } | null;
}

export function RecurringForm({
  open,
  onClose,
  onSaved,
  recurring,
}: RecurringFormProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    currency: "ARS",
    categoryId: "",
    dayOfMonth: "1",
    notes: "",
  });

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories);
  }, []);

  useEffect(() => {
    if (recurring) {
      setForm({
        description: recurring.description,
        amount: recurring.amount.toString(),
        currency: recurring.currency,
        categoryId: recurring.categoryId,
        dayOfMonth: recurring.dayOfMonth.toString(),
        notes: recurring.notes || "",
      });
    } else {
      setForm({
        description: "",
        amount: "",
        currency: "ARS",
        categoryId: "",
        dayOfMonth: "1",
        notes: "",
      });
    }
  }, [recurring, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      description: form.description,
      amount: parseFloat(form.amount),
      currency: form.currency,
      categoryId: form.categoryId,
      dayOfMonth: parseInt(form.dayOfMonth),
      notes: form.notes || null,
    };

    if (recurring) {
      await fetch(`/api/recurring/${recurring.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setLoading(false);
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {recurring ? "Editar gasto recurrente" : "Nuevo gasto recurrente"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="description">Descripcion</Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Ej: Factura de luz"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="amount">Monto</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) =>
                  setForm({ ...form, amount: e.target.value })
                }
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label htmlFor="currency">Moneda</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setForm({ ...form, currency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">$ ARS</SelectItem>
                  <SelectItem value="USD">U$D USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="category">Categoria</Label>
            <Select
              value={form.categoryId}
              onValueChange={(v) => setForm({ ...form, categoryId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <CategoryIcon icon={cat.icon} className="h-4 w-4" />
                      {cat.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="dayOfMonth">Dia del mes que vence</Label>
            <Input
              id="dayOfMonth"
              type="number"
              min="1"
              max="31"
              value={form.dayOfMonth}
              onChange={(e) =>
                setForm({ ...form, dayOfMonth: e.target.value })
              }
              required
            />
          </div>

          <div>
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) =>
                setForm({ ...form, notes: e.target.value })
              }
              placeholder="Notas adicionales..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : recurring ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
