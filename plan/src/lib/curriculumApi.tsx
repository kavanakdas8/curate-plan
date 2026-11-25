import { SavedPlan } from "@/types/study";

const API_BASE_URL = "http://127.0.0.1:8000/api";

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
            error?.detail || `Request failed with status ${response.status}`
        );
    }

    return response.json() as Promise<T>;
}

// Fetch all saved curricula
export async function fetchCurricula(): Promise<SavedPlan[]> {
    const response = await fetch(`${API_BASE_URL}/curricula`, {
        method: "GET",
        cache: "no-store",
    });

    return handleResponse<SavedPlan[]>(response);
}

// Save a new curriculum
export async function createCurriculum(
    plan: SavedPlan
): Promise<SavedPlan> {
    const response = await fetch(`${API_BASE_URL}/curricula`, {
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
    const response = await fetch(
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
    const response = await fetch(
        `${API_BASE_URL}/curricula/${encodeURIComponent(id)}`,
        { method: "DELETE" }
    );

    await handleResponse<{ message: string }>(response);
}