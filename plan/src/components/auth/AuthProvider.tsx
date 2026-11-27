"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
} from "react";

import {
    API_BASE_URL,
    AuthUser,
    authenticatedFetch,
    loginRequest,
    logoutRequest,
    refreshAccessToken,
    registerRequest,
} from "@/lib/auth-client";

interface AuthContextType {
    user: AuthUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (name: string, email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadCurrentUser = async () => {
            try {
                const token = await refreshAccessToken();

                if (!token) {
                    if (isMounted) setUser(null);
                    return;
                }

                const response = await authenticatedFetch(
                    `${API_BASE_URL}/api/auth/me`
                );

                if (!response.ok) {
                    if (isMounted) setUser(null);
                    return;
                }

                const data = await response.json();
                if (isMounted) setUser(data.user);
            } catch {
                if (isMounted) setUser(null);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        void loadCurrentUser();

        return () => {
            isMounted = false;
        };
    }, []);

    const login = async (email: string, password: string) => {
        const result = await loginRequest(email, password);
        setUser(result.user);
    };

    const register = async (name: string, email: string, password: string) => {
        const result = await registerRequest(name, email, password);
        setUser(result.user);
    };

    const logout = async () => {
        setUser(null);
        try {
            await logoutRequest();
        } catch { }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                isAuthenticated: Boolean(user),
                login,
                register,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }

    return context;
}
