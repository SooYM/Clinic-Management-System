"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { UserAccount, ClinicRole } from "../../src/domain/AuthSession";
import { notify } from "../../components/toast";

interface SessionContextType {
  user: UserAccount | null;
  isLoaded: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextType | null>(null);

interface SessionApiUser {
  id: string;
  auth_user_id: string;
  branch_id: string;
  full_name: string;
  role: ClinicRole;
  license_number: string | null;
}

function toUserAccount(user: SessionApiUser): UserAccount {
  const initials = user.full_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return {
    id: user.auth_user_id || user.id,
    username: user.auth_user_id || user.id,
    fullName: user.full_name,
    role: user.role,
    licenseNumber: user.license_number || undefined,
    assignedBranch: user.branch_id,
    avatarInitials: initials,
  };
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string } };
    return payload.error?.message ?? "The clinic server could not complete the request.";
  } catch {
    return "The clinic server could not complete the request.";
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!mounted || response.status === 401 || response.status === 403) return;
        if (!response.ok) throw new Error(await readApiError(response));
        const payload = await response.json() as { user: SessionApiUser };
        if (mounted) setUser(toUserAccount(payload.user));
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setIsLoaded(true);
      });
    return () => { mounted = false; };
  }, []);

  const signIn = async (email: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json() as { user: SessionApiUser };
    const account = toUserAccount(payload.user);
    setUser(account);
    notify(`Signed in successfully as ${account.fullName} (${account.role.toUpperCase()})`, "success");
  };

  const signOut = () => {
    const name = user?.fullName || "User";
    setUser(null);
    void fetch("/api/auth/logout", { method: "POST" });
    notify(`${name} has been signed out. Session closed.`, "info");
  };

  return (
    <SessionContext.Provider value={{ user, isLoaded, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextType {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
