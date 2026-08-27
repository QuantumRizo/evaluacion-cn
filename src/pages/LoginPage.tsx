import { useState, type FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { account } from '../lib/appwrite';

export default function LoginPage() {
  const { login, user, employee, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function sendReset() {
    if (!email.trim()) { setError('Escribe tu correo para enviarte el enlace.'); return; }
    setError('');
    try {
      await account.resetPassword(email.trim(), `${window.location.origin}/restablecer-contrasena`);
      setResetSent(true);
    } catch { setError('No se pudo enviar el correo de recuperación.'); }
  }

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user && employee) {
      navigate(isAdmin ? '/admin' : '/evaluaciones', { replace: true });
    }
  }, [isLoading, user, employee, isAdmin, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      // Redirect handled by useEffect above
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Error al iniciar sesión';
      if (message.includes('Invalid credentials') || message.includes('401')) {
        setError('Correo o contraseña incorrectos.');
      } else if (message.includes('EMPLOYEE_INACTIVE')) {
        setError('Tu acceso está desactivado. Contacta al administrador.');
      } else if (message.includes('EMPLOYEE_PROFILE_NOT_FOUND')) {
        setError('Tu cuenta no está vinculada a un perfil de empleado.');
      } else {
        setError('Ocurrió un error. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-100 font-sans p-6">
      {/* Centered Login Card */}
      <div className="w-full max-w-md bg-white rounded-3xl border border-surface-200 shadow-xl shadow-surface-200/50 flex flex-col p-8 sm:p-10 relative z-10">
        
        {/* Top Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center shadow-lg shadow-primary-500/30">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <span className="text-xl font-bold text-surface-800 tracking-tight">Central de Negocios</span>
        </div>

        {/* Form Container */}
        <div className="w-full flex flex-col">
          <div className="mb-8 text-center">
            <p className="text-surface-500 text-sm mb-1 font-medium">Bienvenido de vuelta</p>
            <h1 className="text-2xl font-extrabold text-surface-800 tracking-tight">
              Inicia sesión
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Email */}
            <div className="relative">
              <label
                htmlFor="email"
                className="absolute -top-2.5 left-3 bg-white px-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-500 z-10"
              >
                E-mail
              </label>
              <div className="relative flex items-center">
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@empresa.com"
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-primary-100 bg-transparent text-surface-800 text-sm placeholder:text-surface-300 focus:outline-none focus:border-primary-500 transition-colors"
                />
                <svg
                  className="absolute right-4 w-5 h-5 text-surface-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>

            {/* Password */}
            <div className="relative mt-2">
              <label
                htmlFor="password"
                className="absolute -top-2.5 left-3 bg-white px-1.5 text-[11px] font-bold uppercase tracking-wider text-surface-400 z-10"
              >
                Contraseña
              </label>
              <div className="relative flex items-center">
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-surface-200 bg-transparent text-surface-800 text-sm placeholder:text-surface-300 focus:outline-none focus:border-primary-500 transition-colors"
                />
                <svg
                  className="absolute right-4 w-5 h-5 text-surface-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
                <svg
                  className="w-4 h-4 text-red-500 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-medium text-red-600">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 mt-2 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:bg-primary-300 text-white text-sm font-semibold shadow-lg shadow-primary-500/25 transition-all duration-200 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Ingresando...
                </>
              ) : (
                'Iniciar sesión'
              )}
            </button>
            <button type="button" onClick={sendReset} className="text-sm text-primary-600 hover:underline">¿Olvidaste tu contraseña?</button>
            {resetSent && <p className="text-xs text-green-600 text-center">Si el correo existe, recibirás un enlace para cambiar la contraseña.</p>}
          </form>
          
          <div className="mt-8 flex items-center gap-4">
            <div className="h-px bg-surface-100 flex-1"></div>
            <span className="text-xs font-medium text-surface-400">Evaluación de Desempeño Corporativo</span>
            <div className="h-px bg-surface-100 flex-1"></div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col gap-3">
          {/* Privacy Alert */}
          <div className="p-3.5 rounded-xl bg-primary-50 border border-primary-100 flex gap-3 text-left">
            <svg className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-primary-800 mb-0.5">Evaluación 100% Confidencial</p>
              <p className="text-[11px] text-primary-600 leading-normal">
                Tus respuestas se recopilan de forma segura. Solo se reportan promedios globales al evaluado, protegiendo tu identidad.
              </p>
            </div>
          </div>
          <p className="text-surface-400 text-xs font-medium text-center">
            Acceso restringido a colaboradores autorizados.
          </p>
        </div>
      </div>
    </div>
  );
}
