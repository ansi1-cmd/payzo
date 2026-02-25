"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MonthSelector } from "@/components/month-selector";
import { ExpenseForm } from "@/components/expense-form";
import { CategoryIcon } from "@/components/category-icon";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Plus,
  Check,
  Pencil,
  Trash2,
  Filter,
  Mail,
  Repeat,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Expense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  categoryId: string;
  dueDate: string;
  paid: boolean;
  paidDate: string | null;
  notes: string | null;
  source: string;
  category: { id: string; name: string; icon: string; color: string };
}

export default function GastosPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filter, setFilter] = useState<"all" | "paid" | "pending">("all");

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    let url = `/api/expenses?month=${month}&year=${year}`;
    if (filter === "paid") url += "&paid=true";
    else if (filter === "pending") url += "&paid=false";
    const res = await fetch(url);
    const json = await res.json();
    setExpenses(json);
    setLoading(false);
  }, [month, year, filter]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const togglePaid = async (expense: Expense) => {
    await fetch(`/api/expenses/${expense.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: !expense.paid }),
    });
    fetchExpenses();
  };

  const deleteExpense = async (id: string) => {
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    fetchExpenses();
  };

  const totalARS = expenses
    .filter((e) => e.currency === "ARS")
    .reduce((sum, e) => sum + e.amount, 0);
  const totalUSD = expenses
    .filter((e) => e.currency === "USD")
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Gastos</h1>
        <div className="flex items-center gap-2">
          <MonthSelector
            month={month}
            year={year}
            onChange={(m, y) => {
              setMonth(m);
              setYear(y);
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setFilter("all")}>
                Todos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilter("paid")}>
                Pagados
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilter("pending")}>
                Pendientes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => { setEditingExpense(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo
          </Button>
        </div>
      </div>

      {/* Totals */}
      <div className="flex gap-4 flex-wrap">
        {totalARS > 0 && (
          <Badge variant="secondary" className="text-sm py-1 px-3">
            Total ARS: {formatCurrency(totalARS, "ARS")}
          </Badge>
        )}
        {totalUSD > 0 && (
          <Badge variant="secondary" className="text-sm py-1 px-3">
            Total USD: {formatCurrency(totalUSD, "USD")}
          </Badge>
        )}
        <Badge variant="outline" className="text-sm py-1 px-3">
          {expenses.filter((e) => e.paid).length}/{expenses.length} pagados
        </Badge>
      </div>

      {/* Expenses List */}
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
      ) : expenses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">
              No hay gastos registrados para este mes
            </p>
            <Button onClick={() => { setEditingExpense(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar gasto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => (
            <Card
              key={expense.id}
              className={expense.paid ? "opacity-60" : ""}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => togglePaid(expense)}
                    className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                      expense.paid
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-muted-foreground/30 hover:border-green-500"
                    }`}
                  >
                    {expense.paid && <Check className="h-4 w-4" />}
                  </button>
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-full"
                    style={{
                      backgroundColor: expense.category.color + "20",
                    }}
                  >
                    <CategoryIcon
                      icon={expense.category.icon}
                      className="h-4 w-4"
                    />
                  </div>
                  <div>
                    <p
                      className={`text-sm font-medium ${expense.paid ? "line-through" : ""}`}
                    >
                      {expense.description}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {expense.category.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Vence {formatDate(expense.dueDate)}
                      </span>
                      {expense.source === "email" && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                          <Mail className="h-2.5 w-2.5" />
                          Auto
                        </Badge>
                      )}
                      {expense.source === "recurring" && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                          <Repeat className="h-2.5 w-2.5" />
                          Recurrente
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2">
                    <p className="text-sm font-semibold">
                      {formatCurrency(expense.amount, expense.currency)}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {expense.currency}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingExpense(expense);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteExpense(expense.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ExpenseForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingExpense(null);
        }}
        onSaved={fetchExpenses}
        expense={editingExpense}
      />
    </div>
  );
}
