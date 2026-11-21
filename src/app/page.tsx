'use client';

import React, { useState, useEffect } from 'react';
import { 
  Send, 
  CheckCircle2, 
  XCircle, 
  Activity, 
  CreditCard, 
  Lock, 
  RefreshCw, 
  FileCheck, 
  Clock, 
  ExternalLink,
  Server,
  AlertTriangle,
  BadgeAlert,
  Sparkles,
  Terminal,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface PaymentItem {
  id: string;
  workspaceName: string;
  productName: string;
  planName: string;
  paymentMethod: string;
  amount: number;
  currency: string;
  reference: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  isDemo: boolean;
}

export default function ConsoleDashboard() {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'payments' | 'uptime' | 'telemetry'>('payments');

  // Payments State
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loadingPayments, setLoadingPayments] = useState<boolean>(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Rejection Modal State
  const [rejectModalItem, setRejectModalItem] = useState<PaymentItem | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  // Uptime State
  const [uptimeData, setUptimeData] = useState<any>(null);
  const [loadingUptime, setLoadingUptime] = useState<boolean>(false);

  // Telemetry Tester State
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'database' | 'payments' | 'build' | 'auth'>('database');

  // Logs / Telemetry Feed State
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'ERROR' | 'PAYMENTS' | 'AUTH' | 'CORE'>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [showSimulator, setShowSimulator] = useState<boolean>(false);

  // Check auth session
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth_token');
    const err = urlParams.get('error');

    if (err === 'unauthorized_email') {
      setAuthError('Acceso Denegado: Tu cuenta de Google no está autorizada como administrador.');
    } else if (err) {
      setAuthError('Error de autenticación con Google. Inténtalo de nuevo.');
    }

    // Si viene token firmado desde el SSO de Core
    if (authToken) {
      fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.email) {
            setIsAuthenticated(true);
            setUserEmail(data.email);
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            setAuthError('Acceso Denegado: Tu cuenta de Google no está autorizada como administrador.');
          }
        })
        .catch(() => {
          setAuthError('Error de conexión al validar sesión');
        })
        .finally(() => {
          setCheckingAuth(false);
        });
      return;
    }

    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.email) {
            setIsAuthenticated(true);
            setUserEmail(data.email);
          }
        }
      } catch (e) {
        console.error('Error verificando sesión de consola:', e);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkSession();
  }, []);

  // Fetch Payments
  const fetchPayments = async () => {
    setLoadingPayments(true);
    try {
      const res = await fetch('/api/payments');
      if (res.ok) {
        const data = await res.json();
        setPayments(data);
      }
    } catch (err) {
      console.error('Error cargando pagos:', err);
    } finally {
      setLoadingPayments(false);
    }
  };

  // Run Uptime Check
  const runUptimeCheck = async () => {
    setLoadingUptime(true);
    try {
      const res = await fetch('/api/cron/uptime');
      const data = await res.json();
      setUptimeData(data);
    } catch (err) {
      console.error('Error corriendo uptime:', err);
    } finally {
      setLoadingUptime(false);
    }
  };

  // Fetch Telemetry & Audit Logs
  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/telemetry');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error cargando logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchPayments();
      runUptimeCheck();
      fetchLogs();
    }
  }, [isAuthenticated]);

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setIsAuthenticated(false);
      setUserEmail('');
      window.location.href = '/';
    }
  };

  const handleAction = async (id: string, action: 'APPROVE' | 'REJECT', reason?: string) => {
    if (action === 'APPROVE') {
      const p = payments.find((item) => item.id === id);
      const intervalLabel = (p as any)?.billingInterval === 'year' ? '1 año (facturación anual)' : '1 mes (facturación mensual)';
      const confirmApprove = window.confirm(
        `¿Confirmas la aprobación del comprobante de "${p?.workspaceName || 'esta clínica'}" por $${((p?.amount || 0) / 100).toFixed(2)} USD?\n\nAl aprobar, se concederá acceso inmediato al sistema y la suscripción comenzará a contar por ${intervalLabel} hasta su fecha de corte.`
      );
      if (!confirmApprove) return;
    }

    setProcessingId(id);
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      if (res.ok) {
        // Actualizar lista local
        setPayments((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' } : p))
        );
        if (rejectModalItem?.id === id) {
          setRejectModalItem(null);
          setRejectReason('');
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert('Error al procesar la acción: ' + (errorData.error || 'Error del servidor'));
      }
    } catch (err) {
      alert('Error de red al actualizar estado.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const p = payments.find((item) => item.id === id);
    const confirmDelete = window.confirm(
      `¿Deseas eliminar el registro del comprobante "${p?.reference || id}" de "${p?.workspaceName || 'esta clínica'}"?\n\nEsta acción quitará el comprobante de la lista de pagos.`
    );
    if (!confirmDelete) return;

    setProcessingId(id);
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPayments((prev) => prev.filter((item) => item.id !== id));
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert('Error al eliminar el pago: ' + (errorData.error || 'Error del servidor'));
      }
    } catch (err) {
      alert('Error de red al intentar eliminar.');
    } finally {
      setProcessingId(null);
    }
  };

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
          message: `¡Alerta enviada a tu Telegram con éxito! (Mensaje ID: ${data.messageId || 'OK'})`
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

  // Pantalla de carga mientras se verifica sesión
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-sm">Verificando acceso de administrador...</span>
        </div>
      </div>
    );
  }

  // Pantalla de acceso con Google
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-indigo-400">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-center text-white mb-2">Axioma Console</h1>
          <p className="text-xs text-slate-400 text-center mb-6">
            Centro de Mando & Control Global. Acceso exclusivo para administradores autorizados.
          </p>

          {authError && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center flex items-center gap-2 justify-center">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            type="button"
            className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 active:scale-95 text-slate-900 font-medium text-sm transition-all shadow-lg flex items-center justify-center gap-3 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continuar con Google</span>
          </button>

          <p className="text-[11px] text-slate-500 text-center mt-6">
            Solo cuentas de correo autorizadas en la lista de administradores tendrán acceso.
          </p>
        </div>
      </div>
    );
  }

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
              Centro de Mando Técnico, Pagos y Telemetría Desacoplado
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Telegram Bot Online
            </div>
            {userEmail && (
              <span className="hidden sm:inline-block px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono">
                {userEmail}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Cerrar Sesión
            </button>
          </div>
        </header>

        {/* NAVIGATION TABS */}
        <div className="flex gap-2 border-b border-slate-800/80 pb-3">
          <button
            onClick={() => setActiveTab('payments')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeTab === 'payments'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Pagos y Demos por Confirmar
            {payments.filter((p) => p.status === 'PENDING').length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-black">
                {payments.filter((p) => p.status === 'PENDING').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('uptime')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeTab === 'uptime'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Server className="w-4 h-4" />
            Uptime & Salud de Servidores
          </button>

          <button
            onClick={() => setActiveTab('telemetry')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeTab === 'telemetry'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            Telemetría & Logs del Sistema
          </button>
        </div>

        {/* TAB 1: PAGOS Y DEMOS POR CONFIRMAR */}
        {activeTab === 'payments' && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Transferencias y Solicitudes de Demo</h2>
                <p className="text-xs text-slate-400">
                  Revisa los números de comprobante antes de activar la cuenta de la clínica
                </p>
              </div>
              <button
                onClick={fetchPayments}
                disabled={loadingPayments}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPayments ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>

            {loadingPayments ? (
              <div className="py-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-indigo-500/40 border-t-indigo-500 rounded-full animate-spin" />
                Cargando registros desde Supabase...
              </div>
            ) : payments.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
                No hay transferencias ni solicitudes de demo registradas en este momento.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-medium">
                      <th className="py-3 px-4">Clínica / Negocio</th>
                      <th className="py-3 px-4">Tipo / Plan</th>
                      <th className="py-3 px-4">Monto</th>
                      <th className="py-3 px-4">Nº Comprobante / Ref</th>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-white">
                          {p.workspaceName}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            p.isDemo ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {p.productName} • {p.planName}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-medium text-emerald-400">
                          {p.amount === 0 ? 'GRATIS (DEMO)' : `$${(p.amount / 100).toFixed(2)} ${p.currency}`}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-indigo-300">
                          {p.reference}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {new Date(p.createdAt).toLocaleDateString('es-ES')}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${
                            p.status === 'APPROVED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : p.status === 'REJECTED'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {p.status === 'PENDING' ? (
                              <>
                                <button
                                  onClick={() => handleAction(p.id, 'APPROVE')}
                                  disabled={processingId === p.id}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-all disabled:opacity-50 cursor-pointer"
                                >
                                  Aprobar
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectModalItem(p);
                                    setRejectReason('');
                                  }}
                                  disabled={processingId === p.id}
                                  className="px-2.5 py-1 rounded-lg bg-red-600/30 hover:bg-red-600 text-red-200 font-medium text-xs transition-all disabled:opacity-50 cursor-pointer"
                                >
                                  Rechazar
                                </button>
                              </>
                            ) : (
                              <span className="text-slate-500 text-xs">Revisado</span>
                            )}
                            <button
                              onClick={() => handleDelete(p.id)}
                              disabled={processingId === p.id}
                              title="Eliminar comprobante"
                              className="p-1 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 text-xs transition-all disabled:opacity-50 cursor-pointer"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* MODAL DE RECHAZO CON CUADRO DE TEXTO */}
            {rejectModalItem && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
                <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
                  <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <span className="p-1 rounded bg-red-500/20 text-red-400">❌</span>
                        Rechazar Comprobante de Pago
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Indica la razón del rechazo. Esta explicación se enviará directamente como notificación al usuario en Axioma Core.
                      </p>
                    </div>
                    <button
                      onClick={() => setRejectModalItem(null)}
                      className="text-slate-400 hover:text-white text-lg p-1 transition-colors cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-xs space-y-1.5 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Clínica:</span>
                      <strong className="text-white">{rejectModalItem.workspaceName}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Producto / Plan:</span>
                      <span>{rejectModalItem.productName} • {rejectModalItem.planName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Monto:</span>
                      <strong className="text-emerald-400 font-mono">${(rejectModalItem.amount / 100).toFixed(2)} {rejectModalItem.currency}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nº Comprobante:</span>
                      <span className="font-mono font-semibold text-indigo-300">{rejectModalItem.reference}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Motivo del Rechazo <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Ej: El número de comprobante no registra depósito en nuestra cuenta bancaria / La foto del comprobante no es legible..."
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-red-500/60 focus:ring-1 focus:ring-red-500 rounded-xl p-3 text-xs text-white placeholder-slate-500 resize-none outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setRejectModalItem(null)}
                      className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!rejectReason.trim() || processingId === rejectModalItem.id}
                      onClick={() => handleAction(rejectModalItem.id, 'REJECT', rejectReason)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                    >
                      {processingId === rejectModalItem.id ? 'Rechazando...' : 'Confirmar Rechazo'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: UPTIME & CRON MONITOR */}
        {activeTab === 'uptime' && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Vigilancia Continua de Servidores</h2>
                <p className="text-xs text-slate-400">
                  Un Cron Job se ejecuta automáticamente en Vercel y te alerta a Telegram ante cualquier caída.
                </p>
              </div>
              <button
                onClick={runUptimeCheck}
                disabled={loadingUptime}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingUptime ? 'animate-spin' : ''}`} />
                Ejecutar Ping Ahora
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { name: 'Axioma Vet', url: 'https://vet.axiomadynamics.com', key: 'Axioma Vet' },
                { name: 'Axioma Core / Portal', url: 'https://app.axiomadynamics.com', key: 'Axioma Core / Portal' },
                { name: 'Supabase Database', url: 'gnfyveyqhjsugdlxnupx.supabase.co', key: 'Supabase Cloud Database' },
              ].map((svc) => {
                const res = uptimeData?.results?.[svc.key];
                const isHealthy = res?.status === 'healthy';

                return (
                  <div key={svc.name} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-white">{svc.name}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isHealthy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {isHealthy ? 'ONLINE (200 OK)' : res ? 'CAÍDO' : 'PENDIENTE'}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-slate-500 truncate">{svc.url}</p>
                    {res?.latencyMs && (
                      <p className="text-[11px] text-slate-400">Latencia: <span className="text-indigo-400 font-mono">{res.latencyMs}ms</span></p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center gap-3">
              <Clock className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>
                <strong>Programación automática:</strong> Configurado en <code>vercel.json</code> cada 10 minutos. Si un servicio se cae o da timeout, la alerta te llega directamente a Telegram con el reporte formateado.
              </span>
            </div>
          </div>
        )}

        {/* TAB 3: TELEMETRÍA Y LOGS DEL SISTEMA */}
        {activeTab === 'telemetry' && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-400" />
                    Telemetría & Auditoría del Sistema
                  </h2>
                  <p className="text-xs text-slate-400">
                    Registros en tiempo real de pagos, autenticación, errores y telemetría de Axioma
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchLogs}
                    disabled={loadingLogs}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                    Actualizar Logs
                  </button>
                  <button
                    onClick={() => setShowSimulator(!showSimulator)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs border border-indigo-500/30 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {showSimulator ? 'Ocultar Simulador' : 'Simulador Telegram'}
                  </button>
                </div>
              </div>

              {/* Filtros */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/80">
                {[
                  { id: 'ALL', label: 'Todos los Registros' },
                  { id: 'ERROR', label: '🚨 Errores y Alertas' },
                  { id: 'PAYMENTS', label: '💳 Pagos y Facturación' },
                  { id: 'AUTH', label: '🔐 Autenticación' },
                  { id: 'CORE', label: '⚙️ Core' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setLogFilter(f.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      logFilter === f.id
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Lista de Logs */}
              {loadingLogs ? (
                <div className="py-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-indigo-500/40 border-t-indigo-500 rounded-full animate-spin" />
                  Cargando registros de telemetría...
                </div>
              ) : logs.length === 0 ? (
                <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
                  No hay registros de auditoría o telemetría disponibles.
                </div>
              ) : (
                <div className="space-y-3">
                  {logs
                    .filter((log) => {
                      if (logFilter === 'ALL') return true;
                      if (logFilter === 'ERROR') {
                        return (
                          log.action?.includes('FAIL') || 
                          log.action?.includes('ERROR') || 
                          log.action?.includes('CRITICAL') || 
                          log.metadata?.severity === 'critical'
                        );
                      }
                      if (logFilter === 'PAYMENTS') {
                        return (
                          log.module === 'payments' || 
                          log.module === 'billing' || 
                          log.action?.includes('PAYMENT')
                        );
                      }
                      if (logFilter === 'AUTH') {
                        return log.action?.includes('LOGIN') || log.action?.includes('AUTH');
                      }
                      if (logFilter === 'CORE') {
                        return log.module === 'core';
                      }
                      return true;
                    })
                    .map((log) => {
                      const isError = 
                        log.action?.includes('FAIL') || 
                        log.action?.includes('ERROR') || 
                        log.action?.includes('CRITICAL') ||
                        log.metadata?.severity === 'critical';
                      const isSuccess = 
                        log.action?.includes('APPROVED') || 
                        log.action?.includes('SUCCESS') ||
                        log.action?.includes('LOGIN');
                      const isExpanded = expandedLogId === log.id;

                      return (
                        <div
                          key={log.id}
                          className={`p-4 rounded-xl border transition-all ${
                            isError
                              ? 'bg-red-950/20 border-red-900/50 hover:border-red-700/60'
                              : isSuccess
                              ? 'bg-emerald-950/10 border-emerald-900/40 hover:border-emerald-700/50'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  isError
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                    : isSuccess
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                }`}
                              >
                                {log.action}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                                {log.module || 'system'}
                              </span>
                              {log.actor_email && (
                                <span className="text-xs text-slate-400 font-mono">
                                  {log.actor_email}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono shrink-0">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>

                          <p className="mt-2 text-xs text-slate-200">
                            {log.summary || 'Sin descripción'}
                          </p>

                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div className="mt-2">
                              <button
                                onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono transition-colors"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="w-3.5 h-3.5" />
                                    Ocultar detalles
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                    Ver payload y metadata
                                  </>
                                )}
                              </button>

                              {isExpanded && (
                                <pre className="mt-2 p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 overflow-x-auto font-mono">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* SIMULADOR DE TELEMETRÍA (COLAPSABLE) */}
            {showSimulator && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Simulador de Telemetría a Telegram</h3>
                  <p className="text-xs text-slate-400">Prueba el envío de alertas de diagnóstico a tu celular</p>
                </div>

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
            )}
          </div>
        )}

      </div>
    </div>
  );
}
