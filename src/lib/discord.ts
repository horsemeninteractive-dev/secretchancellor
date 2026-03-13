import { DiscordSDK } from "@discord/embedded-app-sdk";

export let discordSdk: DiscordSDK | null = null;

export const setupDiscordSdk = async () => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has("frame_id")) {
      console.warn("frame_id not found in URL, Discord SDK will not be initialized");
      return;
    }
    const clientId = (import.meta as any).env?.VITE_DISCORD_CLIENT_ID || "";
    if (!clientId) {
      console.error("VITE_DISCORD_CLIENT_ID is missing");
      return;
    }
    discordSdk = new DiscordSDK(clientId);
    // Add a timeout to ready() to prevent hanging in some environments
    const readyPromise = discordSdk.ready();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Discord SDK ready() timed out')), 5000)
    );

    await Promise.race([readyPromise, timeoutPromise]);
    console.log("Discord SDK is ready");
  } catch (err) {
    console.error("Failed to initialize Discord SDK:", err);
  }
};
