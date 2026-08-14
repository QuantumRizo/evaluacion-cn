import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Models } from 'appwrite';
import { account, databases, Query } from '../lib/appwrite';
import { DB_ID, COLLECTIONS } from '../lib/constants';
import type { Employee } from '../types';

interface AuthContextType {
  user: Models.User<Models.Preferences> | null;
  employee: Employee | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

type AuthStatus = 'authenticated' | 'inactive' | 'missing-profile' | 'unauthenticated';

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth(): Promise<AuthStatus> {
    try {
      const currentUser = await account.get();
      setUser(currentUser);

      const result = await databases.listDocuments(
        DB_ID,
        COLLECTIONS.EMPLOYEES,
        [Query.equal('auth_user_id', currentUser.$id)]
      );

      if (result.documents.length > 0) {
        const employeeDoc = result.documents[0] as unknown as Employee;
        if (employeeDoc.is_active === false) {
          await account.deleteSession('current');
          setUser(null);
          setEmployee(null);
          return 'inactive';
        }

        setEmployee(employeeDoc);
        return 'authenticated';
      } else {
        await account.deleteSession('current');
        setUser(null);
        setEmployee(null);
        return 'missing-profile';
      }
    } catch {
      setUser(null);
      setEmployee(null);
      return 'unauthenticated';
    } finally {
      setIsLoading(false);
    }
  }

  const login = useCallback(async (email: string, password: string) => {
    await account.createEmailPasswordSession(email, password);
    const status = await checkAuth();
    if (status === 'inactive') throw new Error('EMPLOYEE_INACTIVE');
    if (status !== 'authenticated') throw new Error('EMPLOYEE_PROFILE_NOT_FOUND');
  }, []);

  const logout = useCallback(async () => {
    await account.deleteSession('current');
    setUser(null);
    setEmployee(null);
  }, []);

  const value = useMemo(() => ({
    user,
    employee,
    isLoading,
    isAdmin: employee?.role === 'admin',
    login,
    logout,
  }), [user, employee, isLoading, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// This module intentionally exports the provider and its companion hook together.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
