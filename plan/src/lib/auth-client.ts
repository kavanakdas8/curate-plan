const API_BASE_URL = "";

export interface AuthUser {
    id: string;
    name: string;
    email: string;
    created_at: string;
}

export interface AuthResponse {
    user: AuthUser;
    access_token: string;
    token_type: string;
}

interface RefreshResponse {
    access_token: string;
    token_type: string;
}

let accessToken: string | null = null;

let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
    accessToken = token;
}

export function getAccessToken(): string | null {
    return accessToken;
}

async function readError(response: Response): Promise<string> {
    const data = await response.json().catch(() => null);

    if (typeof data?.detail === "string") {
        return data.detail;
    }

    if (Array.isArray(data?.detail)) {
        return data.detail
            .map((item: { msg?: string }) => item.msg ?? "Validation error")
            .join(", ");
    }

    return `Request failed with status ${response.status}`;
}


async function authPost<T>(
    endpoint: string,
    body?: unknown
): Promise<T> {
    const response = await fetch(`${API_BASE_URL}/api/auth/${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(await readError(response));
    }

    return response.json() as Promise<T>;
}


export async function registerRequest(
    name: string,
    email: string,
    password: string
): Promise<AuthResponse> {
    const result = await authPost<AuthResponse>("register", {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
    });

    setAccessToken(result.access_token);

    return result;
}

export async function loginRequest(
    email: string,
    password: string
): Promise<AuthResponse> {
    const result = await authPost<AuthResponse>("login", {
        email: email.trim().toLowerCase(),
        password,
    });

    setAccessToken(result.access_token);

    return result;
}

export async function refreshAccessToken(): Promise<string | null> {
    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
                method: "POST",
                credentials: "include",
            });

            if (!response.ok) {
                setAccessToken(null);
                return null;
            }

            const data = (await response.json()) as RefreshResponse;

            if (!data.access_token) {
                setAccessToken(null);
                return null;
            }

            setAccessToken(data.access_token);

            return data.access_token;
        } catch (error) {
            console.error("Token refresh failed:", error);
            setAccessToken(null);
            return null;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

export async function authenticatedFetch(
    input: RequestInfo | URL,
    init: RequestInit = {}
): Promise<Response> {
    const makeRequest = (token: string | null) => {
        const headers = new Headers(init.headers);

        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        } else {
            headers.delete("Authorization");
        }

        return fetch(input, {
            ...init,
            headers,
            credentials: "include",
        });
    };

    let response = await makeRequest(accessToken);
    if (response.status === 401) {
        const newToken = await refreshAccessToken();

        if (newToken) {
            response = await makeRequest(newToken);
        }
    }

    return response;
}

export async function getCurrentUser(): Promise<AuthUser> {
    const response = await authenticatedFetch(
        `${API_BASE_URL}/api/auth/me`,
        { method: "GET" }
    );

    if (!response.ok) {
        throw new Error(await readError(response));
    }

    return response.json() as Promise<AuthUser>;
}

export async function logoutRequest(): Promise<void> {
    try {
        await authPost<{ message: string }>("logout");
    } finally {
        setAccessToken(null);
    }
}

export { API_BASE_URL };
