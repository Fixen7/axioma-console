'use client';

import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Send, 
  CheckCircle2, 
  XCircle, 
  Activity, 
  Terminal, 
  Database, 
  CreditCard, 
  Layers, 
  ExternalLink,
  Radio,
  Lock,
  Copy,
  Check
} from 'lucide-react';

export default function ConsoleDashboard() {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'database' | 'payments' | 'build' | 'auth'>('database');
  const [copied, setCopied] = useState(false);

  const handleSendTestAlert = async () => {
    setTesting(true);
    setTestResult(null);

    const sampleAlerts = {
      database: {
        category: 'database',
        severity: 'critical',
        title: 'Error de Conexión o RLS en Supabase',
        message: 'new row violates row-level security policy for table "patients"',
        code: '42501',
        table: 'patients',
        operation: 'INSERT',
        workspaceId: 'clinica-demo-01',
        context: { attemptedBy: 'vet_assistant_02', restriction: 'insert_scoped_workspace' }
      },
      payments: {
        category: 'payments',
        severity: 'critical',
        title: 'Fallo en Webhook de Pasarela de Pagos',
        message: 'Signature verification failed on incoming payment confirmation',
        code: 'PAYMENT_SIG_ERR',
        table: 'manual_payments',
        operation: 'WEBHOOK_PROCESS',
        context: { provider: 'bank_transfer', amount: '$49.99' }
      },
      build: {
        category: 'build',
        severity: 'warning',
        title: 'Fallo de Build / Despliegue en Vercel',
        message: 'TypeScript compilation failed on route /api/admin/payments',
        code: 'TS2304',
        operation: 'NEXT_BUILD',
        context: { branch: 'main', commit: 'f83a1b0' }
      },
      auth: {
        category: 'auth',
        severity: 'critical',
        title: 'Bucle de Sesión Corrupta Detectado',
        message: 'Invalid Refresh Token: Token expired or revoked by tenant',
        code: 'AUTH_TOKEN_CORRUPT',
        operation: 'SESSION_EXCHANGE',
        context: { userEmail: 'doctor@veterinaria.com' }
      }
    };

    const payload = sampleAlerts[selectedCategory];

    try {
      const res = await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: 'axioma-test',
          ...payload,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `¡Alerta enviada exitosamente a tu Telegram! (Mensaje ID: ${data.messageId || 'OK'})`
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Error al enviar a Telegram'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Error de conexión con la API'
      });
    } finally {
      setTesting(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const codeSnippet = `// Enviar alertas desde cualquier app satélite (VET, Stock, etc.)
await fetch('https://console.axiomadynamics.com/api/telemetry', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    appId: 'axioma-vet',
    category: 'database',
    severity: 'critical',
    title: 'Error de Supabase',
    message: error.message,
    code: error.code,
    table: 'patients'
  })
});`;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black tracking-tight text-white">AXIOMA</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Console Hub
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Centro de Mando Técnico, Telemetría y Monitoreo Desacoplado
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Telegram Bot Conectado
            </div>
            <div className="text-xs text-slate-400 font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
              ID: 6022360968
            </div>
          </div>
        </header>

        {/* BENTO GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* CARD 1: TESTER DE TELEMETRÍA (2 COLUMNAS) */}
          <div className="md:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Disparador de Telemetría a Telegram</h2>
                <p className="text-xs text-slate-400">Prueba la entrega inmediata de alertas críticas a tu celular</p>
              </div>
            </div>

            <div className="space-y-4 mt-6">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-2 block">
                  Selecciona el tipo de incidente a simular:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'database', label: '🗄️ Supabase', color: 'border-emerald-500/40 bg-emerald-500/5' },
                    { id: 'payments', label: '💳 Pagos', color: 'border-amber-500/40 bg-amber-500/5' },
                    { id: 'build', label: '📦 Vercel Build', color: 'border-blue-500/40 bg-blue-500/5' },
                    { id: 'auth', label: '🔐 Login / Auth', color: 'border-purple-500/40 bg-purple-500/5' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id as any)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-medium border text-left transition-all ${
                        selectedCategory === cat.id
                          ? `${cat.color} text-white ring-1 ring-indigo-500/50`
                          : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleSendTestAlert}
                  disabled={testing}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  {testing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Despachando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Enviar Alerta a mi Telegram
                    </>
                  )}
                </button>
              </div>

              {testResult && (
                <div className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
                  testResult.success 
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' 
                    : 'bg-red-950/40 border-red-800/60 text-red-300'
                }`}>
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* CARD 2: ESTADO DE APLICACIONES */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Ecosistema</h2>
                  <p className="text-xs text-slate-400">Servicios y estado en tiempo real</p>
                </div>
              </div>

              <div className="space-y-3 mt-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="font-medium">Axioma Vet</span>
                  </div>
                  <span className="text-slate-400">vet.axiomadynamics.com</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="font-medium">Axioma Core</span>
                  </div>
                  <span className="text-slate-400">app.axiomadynamics.com</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="font-medium">Hostinger DNS</span>
                  </div>
                  <span className="text-emerald-400 font-mono">OK (300s TTL)</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500">
              Arquitectura desacoplada: Si esta consola se reinicia, ni VET ni CORE sufren caídas.
            </div>
          </div>

          {/* CARD 3: CÓMO CONECTAR APPS SATÉLITE (3 COLUMNAS) */}
          <div className="md:col-span-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Integración Externa por API</h2>
                  <p className="text-xs text-slate-400">
                    Endpoint público de telemetría sin credenciales expuestas en el cliente
                  </p>
                </div>
              </div>

              <button
                onClick={() => copyCode(codeSnippet)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado' : 'Copiar Snippet'}
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs overflow-x-auto leading-relaxed">
              <code>{codeSnippet}</code>
            </pre>
          </div>

        </div>

      </div>
    </div>
  );
}
