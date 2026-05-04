// CORS proxy utility for handling CORS-blocked API requests
import axios from "axios";

// Use a public CORS proxy for development
// For production, you should set up your own backend proxy endpoint
const CORS_PROXY_URL = process.env.REACT_APP_CORS_PROXY || "https://cors.istrav.dev";

/**
 * Makes a request through a CORS proxy when the direct request would be blocked
 * Falls back to direct request if proxy fails
 */
export const withCorsProxy = async (url, config = {}) => {
  // First, try direct request
  try {
    const response = await axios(url, { ...config, timeout: 10000 });
    return response;
  } catch (error) {
    // If CORS error, try proxy
    if (error.response?.status === 0 || error.message?.includes("CORS") || error.message?.includes("Network")) {
      try {
        const proxyUrl = `${CORS_PROXY_URL}/?url=${encodeURIComponent(url)}`;
        const response = await axios(proxyUrl, { ...config, timeout: 10000 });
        return response;
      } catch (proxyError) {
        console.warn(`CORS proxy failed for ${url}:`, proxyError);
        throw error; // Re-throw original error
      }
    }
    throw error;
  }
};

/**
 * POST request through CORS proxy (for JSON-RPC and POST APIs)
 */
export const withCorsProxyPost = async (url, data, config = {}) => {
  // For POST requests, direct call first
  try {
    const response = await axios.post(url, data, { ...config, timeout: 10000 });
    return response;
  } catch (error) {
    // If CORS error, we need to send POST through proxy differently
    if (error.response?.status === 0 || error.message?.includes("CORS") || error.message?.includes("Network")) {
      try {
        // Some CORS proxies support POST by encoding in URL as base64
        const proxyUrl = `${CORS_PROXY_URL}/?url=${encodeURIComponent(url)}`;
        const response = await axios.post(proxyUrl, data, { ...config, timeout: 10000 });
        return response;
      } catch (proxyError) {
        console.warn(`CORS proxy failed for POST ${url}:`, proxyError);
        throw error;
      }
    }
    throw error;
  }
};

/**
 * Alternative: use fetch API for CORS requests (no credentials mode)
 */
export const fetchWithCors = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return await response.json();
    }
    return await response.text();
  } catch (error) {
    console.error(`Fetch failed for ${url}:`, error);
    throw error;
  }
};
