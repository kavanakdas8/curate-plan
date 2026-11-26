import { SavedPlan } from "@/types/study";
import { authenticatedFetch, API_BASE_URL } from "@/lib/auth-client";

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
            error?.detail || `Request failed with status ${response.status}`
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}

// Fetch all saved curricula
export async function fetchCurricula(): Promise<SavedPlan[]> {
    const response = await authenticatedFetch(`${API_BASE_URL}/curricula`, {
        method: "GET",
        cache: "no-store",
    });

    return handleResponse<SavedPlan[]>(response);
}

// Save a new curriculum
export async function createCurriculum(
    plan: SavedPlan
): Promise<SavedPlan> {
    const response = await authenticatedFetch(`${API_BASE_URL}/curricula`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
    });

    return handleResponse<SavedPlan>(response);
}

// Update an existing curriculum
export async function updateCurriculum(
    id: string,
    plan: SavedPlan
): Promise<SavedPlan> {
    const response = await authenticatedFetch(
        `${API_BASE_URL}/curricula/${encodeURIComponent(id)}`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(plan),
        }
    );

    return handleResponse<SavedPlan>(response);
}

// Delete a saved curriculum
export async function deleteCurriculum(id: string): Promise<void> {
    const response = await authenticatedFetch(
        `${API_BASE_URL}/curricula/${encodeURIComponent(id)}`,
        { method: "DELETE" }
    );

    await handleResponse<{ message: string }>(response);
}
