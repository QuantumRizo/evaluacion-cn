import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { account } from '../lib/appwrite';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    setSaving(true);
    try {
      await account.updatePassword(password);
      setMessage('Contraseña actualizada. Ya puedes iniciar sesión.');
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch { setError('El enlace expiró o no es válido. Solicita otro correo de recuperación.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-100 p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-surface-200 shadow-xl p-8 sm:p-10">
        <h1 className="text-2xl font-extrabold text-surface-800">Crea una nueva contraseña</h1>
        <p className="text-sm text-surface-500 mt-2 mb-8">Usa al menos 8 caracteres y no compartas tu contraseña.</p>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <label className="text-sm font-semibold text-surface-700">Nueva contraseña
            <input className="w-full mt-2 px-4 py-3 rounded-xl border-2 border-surface-200" type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
          </label>
          <label className="text-sm font-semibold text-surface-700">Confirmar contraseña
            <input className="w-full mt-2 px-4 py-3 rounded-xl border-2 border-surface-200" type="password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}
          <button className="w-full py-4 rounded-xl bg-primary-500 text-white font-semibold disabled:opacity-50" disabled={saving} type="submit">{saving ? 'Guardando...' : 'Actualizar contraseña'}</button>
        </form>
        <Link className="block mt-6 text-center text-sm text-primary-600" to="/login">Volver al inicio de sesión</Link>
      </div>
    </div>
  );
}
