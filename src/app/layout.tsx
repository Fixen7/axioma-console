import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Axioma Console | Master Control Hub",
  description: "Centro de Mando, Telemetría y Pagos para Desarrolladores de Axioma Dynamics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className="antialiased min-h-screen bg-[#090d16] text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
      </body>
    </html>
  );
}
