"use server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export type DataItem = {
  event_id: number;
  event_timestamp: string;
  event_code: string;
  event_description: string;
  event_video_url: string;
  event_detection_explanation_by_ai: string;
};

export async function fetchData(): Promise<DataItem[]> {
  try {
    const response = await fetch(`${BACKEND_URL}/events?limit=100`, {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      console.error("Failed to fetch events:", response.statusText);
      return [];
    }
    
    const data = await response.json();
    return data.events || [];
  } catch (error) {
    console.error("Error fetching data:", error);
    return [];
  }
}
