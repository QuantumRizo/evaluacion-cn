import React, { useState } from 'react';
import { databases } from '../../lib/appwrite';
import { DB_ID, COLLECTIONS } from '../../lib/constants';
import type { Employee } from '../../types';

interface EmployeesTabProps {
  employees: Employee[];
  onRefresh: () => void;
}

export default function EmployeesTab({ employees, onRefresh }: EmployeesTabProps) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Modals state
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);

  // Edit Form state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editPos, setEditPos] = useState('');
  const [saving, setSaving] = useState(false);

  // Stats
  const totalCount = employees.length;
  const activeCount = employees.filter(e => e.is_active !== false).length;
  const inactiveCount = employees.filter(e => e.is_active === false).length;

  // Filter employees
  const filtered = employees.filter(emp => {
    const isActive = emp.is_active !== false; // default true if undefined
    if (filterStatus === 'active' && !isActive) return false;
    if (filterStatus === 'inactive' && isActive) return false;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchName = emp.name.toLowerCase().includes(q);
      const matchEmail = emp.email.toLowerCase().includes(q);
      const matchDept = (emp.department || '').toLowerCase().includes(q);
      const matchPos = (emp.position || '').toLowerCase().includes(q);
      return matchName || matchEmail || matchDept || matchPos;
    }
    return true;
  });

  // Action: Toggle Active Status
  async function toggleStatus(emp: Employee) {
    const currentActive = emp.is_active !== false;
    const nextActive = !currentActive;

    try {
      await databases.updateDocument(DB_ID, COLLECTIONS.EMPLOYEES, emp.$id, {
        is_active: nextActive,
      });
      onRefresh();
    } catch (err) {
      console.error('Error actualizando estado del empleado:', err);
      alert('Hubo un error al cambiar el estado del empleado.');
    }
  }

  // Action: Open Edit Modal
  function startEdit(emp: Employee) {
    setEditingEmp(emp);
    setEditName(emp.name);
    setEditEmail(emp.email);
    setEditDept(emp.department || '');
    setEditPos(emp.position || '');
  }

  // Action: Save Edit
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEmp || !editName.trim()) return;

    setSaving(true);
    try {
      await databases.updateDocument(DB_ID, COLLECTIONS.EMPLOYEES, editingEmp.$id, {
        name: editName.trim(),
        email: editEmail.trim(),
        department: editDept.trim() || undefined,
        position: editPos.trim() || undefined,
      });
      setEditingEmp(null);
      onRefresh();
    } catch (err) {
      console.error('Error guardando cambios del empleado:', err);
      alert('Hubo un error al actualizar los datos del empleado.');
    } finally {
      setSaving(false);
    }
  }


  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-surface-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
            {totalCount}
          </div>
          <div>
            <div className="text-sm font-semibold text-surface-800">Total Empleados</div>
            <div className="text-xs text-surface-400">Registrados en la plataforma</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-surface-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center font-bold text-lg">
            {activeCount}
          </div>
          <div>
            <div className="text-sm font-semibold text-surface-800">Empleados Activos</div>
            <div className="text-xs text-surface-400">Habilitados para evaluaciones</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-surface-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg">
            {inactiveCount}
          </div>
          <div>
            <div className="text-sm font-semibold text-surface-800">Inactivos / Ex-empleados</div>
            <div className="text-xs text-surface-400">Acceso deshabilitado</div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white p-3 rounded-2xl border border-surface-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <svg className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre, correo, cargo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:border-primary-400 focus:bg-white transition-all"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-1 bg-surface-100 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setFilterStatus('all')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterStatus === 'all' ? 'bg-white text-surface-800 shadow-sm' : 'text-surface-500 hover:text-surface-800'
            }`}
          >
            Todos ({totalCount})
          </button>
          <button
            onClick={() => setFilterStatus('active')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterStatus === 'active' ? 'bg-white text-green-700 shadow-sm' : 'text-surface-500 hover:text-surface-800'
            }`}
          >
            Activos ({activeCount})
          </button>
          <button
            onClick={() => setFilterStatus('inactive')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterStatus === 'inactive' ? 'bg-white text-amber-700 shadow-sm' : 'text-surface-500 hover:text-surface-800'
            }`}
          >
            Inactivos ({inactiveCount})
          </button>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200 text-xs font-bold text-surface-500 uppercase tracking-wider">
                <th className="px-5 py-3.5">Empleado</th>
                <th className="px-5 py-3.5">Cargo / Puesto</th>
                <th className="px-5 py-3.5">Departamento</th>
                <th className="px-5 py-3.5">Estado</th>
                <th className="px-5 py-3.5 text-right">Acciones Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-surface-400">
                    No se encontraron colaboradores con el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => {
                  const isActive = emp.is_active !== false;

                  return (
                    <tr
                      key={emp.$id}
                      className={`hover:bg-surface-50 transition-colors ${!isActive ? 'bg-surface-50/50 opacity-75' : ''}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                            isActive ? 'bg-primary-100 text-primary-700' : 'bg-surface-200 text-surface-500'
                          }`}>
                            {emp.name ? emp.name.substring(0, 2).toUpperCase() : 'CN'}
                          </div>
                          <div>
                            <div className="font-semibold text-surface-800">{emp.name}</div>
                            <div className="text-xs text-surface-400">{emp.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-surface-600 font-medium">
                        {emp.position || <span className="text-surface-300 italic">No especificado</span>}
                      </td>

                      <td className="px-5 py-3.5 text-surface-600 font-medium">
                        {emp.department || <span className="text-surface-300 italic">No especificado</span>}
                      </td>

                      <td className="px-5 py-3.5">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Inactivo / Ex-empleado
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startEdit(emp)}
                            className="px-3 py-1.5 rounded-lg border border-surface-200 hover:bg-surface-100 text-xs font-semibold text-surface-700 transition-colors flex items-center gap-1"
                          >
                            <svg className="w-3.5 h-3.5 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            Editar
                          </button>

                          <button
                            onClick={() => toggleStatus(emp)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1 ${
                              isActive
                                ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            }`}
                          >
                            {isActive ? (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                                Desactivar
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                Reactivar
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Edit Employee */}
      {editingEmp && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-surface-200 p-6 w-full max-w-md shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-surface-800">Editar Nombre / Datos</h3>
              <button
                onClick={() => setEditingEmp(null)}
                className="w-8 h-8 rounded-full hover:bg-surface-100 flex items-center justify-center text-surface-400 hover:text-surface-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-600 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-200 rounded-xl text-sm outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-surface-600 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-200 rounded-xl text-sm outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-surface-600 mb-1">Cargo / Puesto</label>
                <input
                  type="text"
                  placeholder="Ej. Desarrollador Senior"
                  value={editPos}
                  onChange={(e) => setEditPos(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-200 rounded-xl text-sm outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-surface-600 mb-1">Departamento</label>
                <input
                  type="text"
                  placeholder="Ej. Tecnología"
                  value={editDept}
                  onChange={(e) => setEditDept(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-200 rounded-xl text-sm outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingEmp(null)}
                  className="flex-1 py-2.5 border border-surface-200 rounded-xl text-sm font-semibold text-surface-600 hover:bg-surface-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-sm font-semibold shadow-md shadow-primary-500/20"
                >
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
