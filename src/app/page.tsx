"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MonthSelector } from "@/components/month-selector";
import { CategoryIcon } from "@/components/category-icon";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Mail,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface DashboardData {
  totals: {
    totalARS: number;
    totalUSD: number;
    paidARS: number;
    paidUSD: number;
    pendingARS: number;
    pendingUSD: number;
  };
  byCategory: { name: string; color: string; ARS: number; USD: number }[];
  upcoming: {
    id: string;
    description: string;
    amount: number;
    currency: string;
    dueDate: string;
    category: { name: string; icon: string; color: string };
  }[];
  overdue: {
    id: string;
    description: string;
    amount: number;
    currency: string;
    dueDate: string;
    category: { name: string; icon: string; color: string };
  }[];
  expenseCount: number;
  paidCount: number;
}

export default function DashboardPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/dashboard?month=${month}&year=${year}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [month, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const scanEmails = async () => {
    setScanning(true);
    setScanResult(null);
    setScanStatus("Buscando emails...");

    try {
      // Step 1: Fetch emails from IMAP
      const fetchRes = await fetch("/api/email/fetch", { method: "POST" });
      const fetchJson = await fetchRes.json();

      if (!fetchRes.ok) {
        setScanResult(fetchJson.error || "Error al buscar emails");
        return;
      }

      if (fetchJson.pending === 0) {
        setScanResult(
          `No hay emails nuevos (${fetchJson.skipped} ya procesados)`
        );
        return;
      }

      setScanStatus(
        `${fetchJson.pending} emails nuevos encontrados. Procesando...`
      );

      // Step 2: Process one at a time
      let created = 0;
      let notInvoice = 0;
      let errors = 0;
      let remaining = fetchJson.pending;

      while (remaining > 0) {
        setScanStatus(
          `Procesando ${remaining} email${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}...`
        );

        const processRes = await fetch("/api/email/process", {
          method: "POST",
        });
        const processJson = await processRes.json();

        if (!processRes.ok) {
          errors++;
          remaining--;
          continue;
        }

        if (processJson.done) break;

        remaining = processJson.remaining;

        if (processJson.result?.result === "created") {
          created++;
        } else if (processJson.result?.result === "not_invoice") {
          notInvoice++;
        }
      }

      const parts: string[] = [];
      if (created > 0) parts.push(`${created} gasto${created > 1 ? "s" : ""} creado${created > 1 ? "s" : ""}`);
      if (notInvoice > 0) parts.push(`${notInvoice} no eran facturas`);
      if (fetchJson.skipped > 0) parts.push(`${fetchJson.skipped} ya procesados`);
      if (errors > 0) parts.push(`${errors} error${errors > 1 ? "es" : ""}`);

      setScanResult(parts.join(", ") || "Escaneo completado");
      if (created > 0) fetchData();
    } catch {
      setScanResult("Error de conexion");
    } finally {
      setScanning(false);
      setScanStatus(null);
      setTimeout(() => setScanResult(null), 8000);
    }
  };

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <MonthSelector
            month={month}
            year={year}
            onChange={(m, y) => {
              setMonth(m);
              setYear(y);
            }}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const { totals, byCategory, upcoming, overdue } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={scanEmails}
            disabled={scanning}
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            {scanning ? "Escaneando..." : "Escanear emails"}
          </Button>
          <MonthSelector
            month={month}
            year={year}
            onChange={(m, y) => {
              setMonth(m);
              setYear(y);
            }}
          />
        </div>
      </div>

      {(scanStatus || scanResult) && (
        <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            {scanStatus ? (
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            ) : (
              <Mail className="h-4 w-4 text-muted-foreground" />
            )}
            {scanStatus || scanResult}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total del mes
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {totals.totalARS > 0 && (
              <div className="text-2xl font-bold">
                {formatCurrency(totals.totalARS, "ARS")}
              </div>
            )}
            {totals.totalUSD > 0 && (
              <div
                className={`${totals.totalARS > 0 ? "text-lg" : "text-2xl"} font-bold text-green-600`}
              >
                {formatCurrency(totals.totalUSD, "USD")}
              </div>
            )}
            {totals.totalARS === 0 && totals.totalUSD === 0 && (
              <div className="text-2xl font-bold text-muted-foreground">-</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pagado
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {totals.paidARS > 0 && (
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(totals.paidARS, "ARS")}
              </div>
            )}
            {totals.paidUSD > 0 && (
              <div
                className={`${totals.paidARS > 0 ? "text-lg" : "text-2xl"} font-bold text-green-600`}
              >
                {formatCurrency(totals.paidUSD, "USD")}
              </div>
            )}
            {totals.paidARS === 0 && totals.paidUSD === 0 && (
              <div className="text-2xl font-bold text-muted-foreground">-</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendiente
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {totals.pendingARS > 0 && (
              <div className="text-2xl font-bold text-yellow-600">
                {formatCurrency(totals.pendingARS, "ARS")}
              </div>
            )}
            {totals.pendingUSD > 0 && (
              <div
                className={`${totals.pendingARS > 0 ? "text-lg" : "text-2xl"} font-bold text-yellow-600`}
              >
                {formatCurrency(totals.pendingUSD, "USD")}
              </div>
            )}
            {totals.pendingARS === 0 && totals.pendingUSD === 0 && (
              <div className="text-2xl font-bold text-muted-foreground">-</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vencidos
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${overdue.length > 0 ? "text-red-600" : "text-muted-foreground"}`}
            >
              {overdue.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.paidCount}/{data.expenseCount} pagos completados
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart by category */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Gastos por categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            {byCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={byCategory} layout="vertical">
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `$${v.toLocaleString()}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => [
                      `$${Number(value).toLocaleString()}`,
                    ]}
                  />
                  <Bar dataKey="ARS" name="ARS" radius={[0, 4, 4, 0]}>
                    {byCategory.map((entry, index) => (
                      <Cell key={`ars-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No hay gastos registrados este mes
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming payments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Proximos vencimientos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length > 0 ? (
              <div className="space-y-3">
                {upcoming.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
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
                        <p className="text-sm font-medium">
                          {expense.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Vence {formatShortDate(expense.dueDate)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {formatCurrency(expense.amount, expense.currency)}
                      </p>
                      <Badge variant="outline" className="text-xs">
                        {expense.currency}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No hay pagos pendientes
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              Pagos vencidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overdue.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50"
                >
                  <div className="flex items-center gap-3">
                    <CategoryIcon
                      icon={expense.category.icon}
                      className="h-4 w-4 text-red-500"
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {expense.description}
                      </p>
                      <p className="text-xs text-red-500">
                        Vencio {formatShortDate(expense.dueDate)}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-red-600">
                    {formatCurrency(expense.amount, expense.currency)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
