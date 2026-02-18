import { API_KEY, API_URL } from "../secrets";

// Default public avatars list
const PUBLIC_AVATAR_IDS = [
  "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a", // Default
  "1c690fe7-23e0-49f9-bfba-14344450285b",
  "513fd1b7-7ef9-466d-9af2-344e51eeb833",
  "fc9c1f9f-bc99-4fd9-a6b2-8b4b5669a046",
  "7b888024-f8c9-4205-95e1-78ce01497bda",
  "bd43ce31-7425-4379-8407-60f029548e61",
  "6e32f90a-f566-45be-9ec7-a5f6999ee606",
  "65f9e3c9-d48b-4118-b73a-4ae2e3cbb8f0",
  "55eec60c-d665-4972-a529-bbdcaf665ab8",
  "073b60a9-89a8-45aa-8902-c358f64d2852",
  "dc2935cf-5863-4f08-943b-c7478aea59fb",
];

interface Avatar {
  id: string;
  name: string;
  preview_url?: string;
  default_voice?: {
    id: string;
    name: string;
  };
  is_custom?: boolean;
}

export async function GET() {
  try {
    const avatars: Avatar[] = [];

    // Step 1: Try to fetch custom avatars from user's account
    try {
      const customRes = await fetch(`${API_URL}/v1/avatars?page=1&page_size=50`, {
        method: "GET",
        headers: {
          "X-API-KEY": API_KEY,
          "Content-Type": "application/json",
        },
      });

      if (customRes.ok) {
        const customData = await customRes.json();

        // API returns { code: 1000, data: { results: [...], count: N } }
        const customAvatars = customData.data?.results || [];

        // Filter for active custom avatars
        for (const avatar of customAvatars) {
          // Status is uppercase "ACTIVE" from the API
          if (avatar.status === "ACTIVE" || avatar.status === "active") {
            avatars.push({
              id: avatar.id || avatar.avatar_id,
              name: avatar.name || "Custom Avatar",
              preview_url: avatar.preview_url || avatar.thumbnail_url,
              default_voice: avatar.default_voice,
              is_custom: true,
            });
          }
        }
      }
    } catch (customError) {
      console.error("Error fetching custom avatars:", customError);
    }

    // Step 2: Fetch public avatars
    try {
      const publicRes = await fetch(`${API_URL}/v1/avatars/public?page=1&page_size=50`, {
        method: "GET",
        headers: {
          "X-API-KEY": API_KEY,
          "Content-Type": "application/json",
        },
      });

      if (publicRes.ok) {
        const publicData = await publicRes.json();

        // API returns { code: 1000, data: { results: [...], count: N } }
        const publicAvatars = publicData.data?.results || [];

        // Add public avatars that are in our curated list
        for (const avatar of publicAvatars) {
          const avatarId = avatar.id || avatar.avatar_id;
          if (PUBLIC_AVATAR_IDS.includes(avatarId)) {
            avatars.push({
              id: avatarId,
              name: avatar.name || "Public Avatar",
              preview_url: avatar.preview_url || avatar.thumbnail_url,
              default_voice: avatar.default_voice,
              is_custom: false,
            });
          }
        }
      }
    } catch (publicError) {
      console.error("Error fetching public avatars:", publicError);
    }

    // Step 3: Sort avatars - custom first, then by whether they're the default
    avatars.sort((a, b) => {
      // Custom avatars first
      if (a.is_custom && !b.is_custom) return -1;
      if (!a.is_custom && b.is_custom) return 1;

      // Default avatar first among public
      if (a.id === PUBLIC_AVATAR_IDS[0]) return -1;
      if (b.id === PUBLIC_AVATAR_IDS[0]) return 1;

      return 0;
    });

    // If no avatars found, return the default public avatar ID
    if (avatars.length === 0) {
      avatars.push({
        id: PUBLIC_AVATAR_IDS[0],
        name: "Default Avatar",
        is_custom: false,
      });
    }

    return new Response(
      JSON.stringify({ avatars }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error fetching avatars:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
