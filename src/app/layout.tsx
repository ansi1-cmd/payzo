import type { Metadata } from "next";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";

export const metadata: Metadata = {
  title: "Payzo - Dashboard de Gastos",
  description: "Control de gastos y pagos mensuales",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">
        <Sidebar />
        <main className="md:ml-64 min-h-screen pb-20 md:pb-0">
          <div className="p-4 md:p-8">{children}</div>
        </main>
        <MobileNav />
      </body>
    </html>
  );
}
