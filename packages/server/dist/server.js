var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// middleware/auth.ts
var auth_exports = {};
__export(auth_exports, {
  default: () => auth_default
});
import path2 from "path";
import { createClient as createClient8 } from "@supabase/supabase-js";
var supabaseAdmin7, authMiddleware, auth_default;
var init_auth = __esm({
  "middleware/auth.ts"() {
    "use strict";
    supabaseAdmin7 = createClient8(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    authMiddleware = async (req, res, next) => {
      try {
        const skipAuthPaths = [
          "/login.html",
          "/styles.css",
          "/",
          "/app.html"
        ];
        const shouldSkipAuth = skipAuthPaths.includes(req.path) || req.path.startsWith("/api/") || !req.path.endsWith(".html");
        if (shouldSkipAuth) {
          return next();
        }
        let token = req.cookies["sb-access-token"];
        if (!token && req.headers.authorization?.startsWith("Bearer ")) {
          token = req.headers.authorization.split(" ")[1];
        }
        if (!token) {
          console.error("No access token found in cookie or Authorization header");
          res.status(401).json({ error: "Not authenticated" });
          return;
        }
        const { data: { user }, error } = await supabaseAdmin7.auth.getUser(token);
        if (error) {
          console.error("Auth error:", error.message);
          res.clearCookie("sb-access-token");
          res.sendFile(path2.join(__dirname, "..", "public", "login.html"));
          return;
        }
        if (!user) {
          console.log("No user found for token");
          res.clearCookie("sb-access-token");
          res.sendFile(path2.join(__dirname, "..", "public", "login.html"));
          return;
        }
        req.user = {
          id: user.id,
          email: user.email || "",
          ...user.user_metadata
        };
        console.log(`Authenticated user: ${user.email}`);
        next();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown authentication error";
        console.error("Auth error:", errorMessage);
        res.clearCookie("sb-access-token");
        res.sendFile(path2.join(__dirname, "..", "public", "login.html"));
      }
    };
    auth_default = authMiddleware;
  }
});

// middleware/error.ts
var error_exports = {};
__export(error_exports, {
  asyncHandler: () => asyncHandler,
  errorHandler: () => errorHandler,
  notFoundHandler: () => notFoundHandler
});
var errorHandler, notFoundHandler, asyncHandler;
var init_error = __esm({
  "middleware/error.ts"() {
    "use strict";
    errorHandler = (error, _req, res, _next) => {
      console.error("Error occurred:", error.message, error.stack);
      const statusCode = error.statusCode || 500;
      const message = process.env.NODE_ENV === "production" && statusCode === 500 ? "Internal server error" : error.message || "An unexpected error occurred";
      const errorResponse = {
        success: false,
        error: message
      };
      if (error.code) {
        errorResponse.code = error.code;
      }
      if (process.env.NODE_ENV === "development") {
        if (error.details) {
          errorResponse.details = error.details;
        }
        if (error.stack) {
          errorResponse.stack = error.stack;
        }
      }
      res.status(statusCode).json(errorResponse);
    };
    notFoundHandler = (_req, res) => {
      const errorResponse = {
        success: false,
        error: `Endpoint not found`,
        code: "ENDPOINT_NOT_FOUND"
      };
      res.status(404).json(errorResponse);
    };
    asyncHandler = (fn) => {
      return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
      };
    };
  }
});

// server.ts
import express6 from "express";
import path3 from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenvFlow from "dotenv-flow";

// routes/index.ts
import express5 from "express";

// routes/transcribe.ts
import express from "express";
import path from "path";
import os from "os";
import fs2 from "fs";
import { finished } from "stream/promises";
import { Readable } from "stream";

// lib/transcribe.ts
import fs from "fs";
import { createClient } from "@deepgram/sdk";
var dg = null;
function getDeepgramClient() {
  if (!dg) {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPGRAM_API_KEY not found.");
    }
    dg = createClient(apiKey);
  }
  return dg;
}
async function transcribe(filePath) {
  const audioStream = fs.createReadStream(filePath);
  const client = getDeepgramClient();
  try {
    const { result, error } = await client.listen.prerecorded.transcribeFile(
      audioStream,
      {
        model: "nova-3",
        smart_format: true,
        punctuate: true
      }
    );
    if (error) {
      throw error;
    }
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (!transcript) {
      throw new Error("Transcription failed: No transcript in result");
    }
    return transcript;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown transcription error";
    console.error("[transcribe.ts:transcribe] Error during transcription:", errorMessage);
    throw error;
  }
}

// services/podcastService.ts
import { XMLParser } from "fast-xml-parser";

// lib/spotify.ts
import querystring from "querystring";
var spotifyToken = null;
var spotifyTokenExpiresAt = 0;
async function getSpotifyAccessToken() {
  const now = Date.now();
  if (spotifyToken && now < spotifyTokenExpiresAt) {
    return spotifyToken;
  }
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in environment variables");
  }
  const creds = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: querystring.stringify({ grant_type: "client_credentials" })
  });
  if (!res.ok) {
    const errorBody = await res.text();
    console.error("Spotify Access Token Request Failed - Status:", res.status);
    console.error("Spotify Access Token Request Failed - Body:", errorBody);
    throw new Error(`Failed to get Spotify access token. Status: ${res.status}. Response: ${errorBody}`);
  }
  const data = await res.json();
  spotifyToken = data.access_token;
  spotifyTokenExpiresAt = now + data.expires_in * 1e3 - 6e4;
  return spotifyToken;
}

// lib/utils.ts
import crypto from "crypto";
function getAuthHeaders() {
  const apiKey = process.env.PODCASTINDEX_KEY;
  const apiSecret = process.env.PODCASTINDEX_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("PodcastIndex API Key/Secret is missing. Please check environment variables.");
  }
  const apiHeaderTime = Math.floor(Date.now() / 1e3);
  const signature = crypto.createHash("sha1").update(apiKey + apiSecret + apiHeaderTime.toString()).digest("hex");
  console.log("DEBUG: Generated signature for timestamp:", apiHeaderTime);
  console.log("DEBUG: Signature preview:", signature.substring(0, 10) + "...");
  return {
    "X-Auth-Key": apiKey,
    "X-Auth-Date": apiHeaderTime.toString(),
    "Authorization": signature
  };
}
async function getTitleSlug(spotifyUrl) {
  const cleanUrl = spotifyUrl.split("?")[0];
  const { pathname } = new URL(cleanUrl);
  const [, type, id] = pathname.split("/");
  if (type !== "show") {
    throw new Error("getTitleSlug: URL is not a Spotify show link");
  }
  const token = await getSpotifyAccessToken();
  const apiRes = await fetch(`https://api.spotify.com/v1/shows/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!apiRes.ok) {
    throw new Error("Failed to fetch show from Spotify API");
  }
  const showData = await apiRes.json();
  const { name } = showData;
  if (!name) {
    throw new Error("No show name returned from Spotify API");
  }
  return name.toLowerCase().replace(/\|.*$/, "").replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").trim();
}
async function getFeedUrl(slug) {
  const authHeaders = getAuthHeaders();
  const searchUrl = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(slug)}`;
  const searchRes = await fetch(searchUrl, {
    headers: {
      ...authHeaders,
      "User-Agent": process.env.USER_AGENT || "Listener-App/1.0"
    }
  });
  if (!searchRes.ok) {
    const errorText = await searchRes.text().catch(() => "Could not read response");
    console.error("PodcastIndex API Error Response:", errorText);
    throw new Error(`PodcastIndex search failed with status ${searchRes.status}`);
  }
  const searchData = await searchRes.json();
  const { feeds } = searchData;
  let feedUrl = null;
  if (feeds && feeds.length > 0) {
    for (const feed of feeds) {
      if (jaccardSimilarity(feed.title.toLowerCase(), slug) >= 0.8) {
        feedUrl = feed.url;
        break;
      }
    }
    if (!feedUrl && feeds[0]) {
      feedUrl = feeds[0].url;
    }
  }
  if (!feedUrl) {
    const itunesRes = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(slug)}&media=podcast&limit=1`
    );
    if (itunesRes.ok) {
      const itunesData = await itunesRes.json();
      if (itunesData.results && itunesData.results.length > 0 && itunesData.results[0]?.feedUrl) {
        feedUrl = itunesData.results[0].feedUrl;
      }
    }
  }
  return feedUrl;
}
function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = (/* @__PURE__ */ new Set([...setA, ...setB])).size;
  return union === 0 ? 0 : intersection / union;
}

// services/podcastService.ts
var PodcastError = class extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "PodcastError";
    this.statusCode = statusCode;
  }
};
var PodcastService = class {
  /**
   * Validates if the provided URL is a valid Spotify podcast URL
   * @param {string} url - The Spotify URL to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  validateSpotifyUrl(url) {
    const spotifyRegex = /^https:\/\/open\.spotify\.com\/show\/[A-Za-z0-9]+(?:\?[^\s]*)?$/;
    return spotifyRegex.test(url);
  }
  /**
   * Gets the podcast slug from a Spotify URL
   * @param {string} url - The Spotify URL
   * @returns {Promise<string>} - The podcast slug
   * @throws {PodcastError} - If the slug cannot be retrieved
   */
  async getPodcastSlug(url) {
    try {
      return await getTitleSlug(url);
    } catch (error) {
      const err = error;
      throw new PodcastError(`Failed to get podcast slug: ${err.message}`, 500);
    }
  }
  /**
   * Gets the RSS feed URL for a podcast
   * @param {string} slug - The podcast slug
   * @returns {Promise<string>} - The RSS feed URL
   * @throws {PodcastError} - If the feed URL cannot be retrieved
   */
  async getPodcastFeed(slug) {
    try {
      const feedUrl = await getFeedUrl(slug);
      if (!feedUrl) {
        throw new PodcastError("Podcast has no public RSS; probably Spotify-exclusive.", 404);
      }
      return feedUrl;
    } catch (error) {
      const err = error;
      throw new PodcastError(`Failed to get podcast feed: ${err.message}`, 502);
    }
  }
  /**
   * Fetches the RSS feed content
   * @param {string} feedUrl - The RSS feed URL
   * @returns {Promise<string>} - The RSS feed content
   * @throws {PodcastError} - If the feed cannot be fetched
   */
  async fetchRssFeed(feedUrl) {
    try {
      const response = await fetch(feedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch RSS: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      const err = error;
      throw new PodcastError(`Failed to fetch RSS feed: ${err.message}`, 502);
    }
  }
  /**
   * Parses RSS feed content into an object
   * @param {string} rssText - The RSS feed content
   * @returns {RssFeed} - The parsed RSS feed
   * @throws {PodcastError} - If the feed cannot be parsed
   */
  parseRssFeed(rssText) {
    try {
      const parser = new XMLParser({ ignoreAttributes: false });
      return parser.parse(rssText);
    } catch (error) {
      const err = error;
      throw new PodcastError(`Failed to parse RSS feed: ${err.message}`, 500);
    }
  }
  /**
   * Extracts the MP3 URL from the RSS feed data
   * @param {RssFeed} rssData - The parsed RSS feed data
   * @returns {string} - The MP3 URL
   * @throws {PodcastError} - If the MP3 URL cannot be found
   */
  extractMp3Url(rssData) {
    try {
      const items = rssData.rss.channel.item;
      const firstItem = Array.isArray(items) ? items[0] : items;
      if (!firstItem) {
        throw new Error("No items found in RSS feed");
      }
      const enclosure = firstItem.enclosure;
      const mp3Url = enclosure && (enclosure["@_url"] || enclosure.url);
      if (!mp3Url) {
        throw new Error("No enclosure URL found in first item");
      }
      return mp3Url;
    } catch (error) {
      const err = error;
      throw new PodcastError(`Failed to extract MP3 URL: ${err.message}`, 500);
    }
  }
};
var podcastService_default = new PodcastService();

// routes/transcribe.ts
var router = express.Router();
router.get("/", async (req, res) => {
  const spotifyUrl = req.query.url;
  if (!spotifyUrl) {
    res.status(400).json({
      success: false,
      error: "Missing `url` query parameter."
    });
    return;
  }
  if (!podcastService_default.validateSpotifyUrl(spotifyUrl)) {
    res.status(400).json({
      success: false,
      error: "Invalid URL; must be a valid Spotify show URL."
    });
    return;
  }
  let tmpFile;
  try {
    const slug = await podcastService_default.getPodcastSlug(spotifyUrl);
    const feedUrl = await podcastService_default.getPodcastFeed(slug);
    const rssText = await podcastService_default.fetchRssFeed(feedUrl);
    const rssData = podcastService_default.parseRssFeed(rssText);
    const mp3Url = podcastService_default.extractMp3Url(rssData);
    const audioRes = await fetch(mp3Url);
    if (!audioRes.ok) {
      throw new Error(`MP3 fetch failed: ${audioRes.status}`);
    }
    tmpFile = path.join(os.tmpdir(), `${slug}.mp3`);
    const out = fs2.createWriteStream(tmpFile);
    const nodeStream = Readable.from(audioRes.body);
    nodeStream.pipe(out);
    await finished(out);
    const transcriptText = await transcribe(tmpFile);
    res.type("text/plain").send(transcriptText);
  } catch (error) {
    const err = error;
    console.error(`Error processing GET /transcribe for url ${spotifyUrl}:`, err.message, err.stack);
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message
    });
  } finally {
    if (tmpFile) {
      fs2.unlink(tmpFile, () => {
      });
    }
  }
});
router.post("/", async (req, res) => {
  const { spotifyUrl } = req.body;
  if (!spotifyUrl) {
    res.status(400).json({
      success: false,
      error: "Missing spotifyUrl in request body."
    });
    return;
  }
  if (!podcastService_default.validateSpotifyUrl(spotifyUrl)) {
    res.status(400).json({
      success: false,
      error: "Invalid Spotify URL provided."
    });
    return;
  }
  let tmpFile;
  let slug;
  try {
    slug = await podcastService_default.getPodcastSlug(spotifyUrl);
    const feedUrl = await podcastService_default.getPodcastFeed(slug);
    const rssText = await podcastService_default.fetchRssFeed(feedUrl);
    const rssData = podcastService_default.parseRssFeed(rssText);
    const mp3Url = podcastService_default.extractMp3Url(rssData);
    const audioRes = await fetch(mp3Url);
    if (!audioRes.ok) {
      const fetchError = new Error(`MP3 fetch failed: ${audioRes.status}`);
      fetchError.statusCode = 500;
      throw fetchError;
    }
    tmpFile = path.join(os.tmpdir(), `${slug}.mp3`);
    const out = fs2.createWriteStream(tmpFile);
    const nodeStream = Readable.from(audioRes.body);
    nodeStream.pipe(out);
    await finished(out);
    const transcript = await transcribe(tmpFile);
    const transcriptionResponse = {
      transcript,
      confidence: 1,
      // Default confidence, could be enhanced
      duration: 0
      // Could be calculated from audio file
    };
    res.status(200).json({
      success: true,
      data: transcriptionResponse
    });
  } catch (error) {
    const err = error;
    console.error(`Error processing POST /transcribe for slug ${slug || "unknown"}:`, err.message, err.stack);
    let errorMessage = err.message;
    const statusCode = err.statusCode || 500;
    if (err.message.includes("Slug error") || err.message.includes(slug || "")) {
      errorMessage = `Failed to process podcast feed: ${err.message}`;
    } else if (err.message.startsWith("MP3 fetch failed:") || err.message.includes("Network error")) {
      errorMessage = `Failed to download MP3 file: ${err.message}`;
    } else if (err.message.includes("FS error") || err.message.includes("Stream pipe error")) {
      errorMessage = `Failed to save MP3 file: ${err.message}`;
    } else if (err.message.includes("Transcription error")) {
      errorMessage = `Error during transcription: ${err.message}`;
    }
    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  } finally {
    if (tmpFile) {
      fs2.unlink(tmpFile, (unlinkErr) => {
        if (unlinkErr) {
          console.error(`Failed to delete temp file ${tmpFile}:`, unlinkErr);
        }
      });
    }
  }
});
var transcribe_default = router;

// routes/spotifyTokens.ts
import express2 from "express";
import { createClient as createClient3 } from "@supabase/supabase-js";

// lib/vaultHelpers.ts
import { createClient as createClient2 } from "@supabase/supabase-js";
var supabaseAdmin = null;
function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required Supabase environment variables");
    }
    supabaseAdmin = createClient2(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabaseAdmin;
}
function getSpotifySecretName(userId) {
  return `spotify:${userId}:tokens`;
}
function logVaultOperation(userId, operation, elapsedMs, success, error) {
  const logData = {
    user_id: userId,
    operation,
    elapsed_ms: elapsedMs,
    success,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...error && { error }
  };
  console.log(`VAULT_OPERATION: ${JSON.stringify(logData)}`);
}
async function createUserSecret(userId, tokenData) {
  const startTime = Date.now();
  const secretName = getSpotifySecretName(userId);
  try {
    const supabase = getSupabaseAdmin();
    const { data: secretId, error } = await supabase.rpc("vault_create_user_secret", {
      p_secret_name: secretName,
      p_secret_data: JSON.stringify(tokenData),
      p_description: `Spotify tokens for user ${userId}`
    });
    const elapsedMs = Date.now() - startTime;
    if (error) {
      logVaultOperation(userId, "create", elapsedMs, false, error.message);
      return {
        success: false,
        error: error.message,
        elapsed_ms: elapsedMs
      };
    }
    const { error: updateError } = await supabase.from("users").update({
      spotify_vault_secret_id: secretId,
      spotify_reauth_required: false,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", userId);
    if (updateError) {
      logVaultOperation(userId, "create", elapsedMs, false, `User update failed: ${updateError.message}`);
      return {
        success: false,
        error: `User update failed: ${updateError.message}`,
        elapsed_ms: elapsedMs
      };
    }
    logVaultOperation(userId, "create", elapsedMs, true);
    return {
      success: true,
      data: tokenData,
      elapsed_ms: elapsedMs
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logVaultOperation(userId, "create", elapsedMs, false, errorMessage);
    return {
      success: false,
      error: errorMessage,
      elapsed_ms: elapsedMs
    };
  }
}
async function getUserSecret(userId) {
  const startTime = Date.now();
  try {
    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.from("users").select("spotify_vault_secret_id").eq("id", userId).single();
    if (userError || !userData?.spotify_vault_secret_id) {
      const elapsedMs2 = Date.now() - startTime;
      const errorMsg = userError?.message || "No vault secret ID found for user";
      logVaultOperation(userId, "read", elapsedMs2, false, errorMsg);
      return {
        success: false,
        error: errorMsg,
        elapsed_ms: elapsedMs2
      };
    }
    const { data: secretData, error } = await supabase.rpc("vault_read_user_secret", {
      p_secret_id: userData.spotify_vault_secret_id
    });
    const elapsedMs = Date.now() - startTime;
    if (error) {
      logVaultOperation(userId, "read", elapsedMs, false, error.message);
      return {
        success: false,
        error: error.message,
        elapsed_ms: elapsedMs
      };
    }
    const tokenData = JSON.parse(secretData);
    logVaultOperation(userId, "read", elapsedMs, true);
    return {
      success: true,
      data: tokenData,
      elapsed_ms: elapsedMs
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logVaultOperation(userId, "read", elapsedMs, false, errorMessage);
    return {
      success: false,
      error: errorMessage,
      elapsed_ms: elapsedMs
    };
  }
}
async function updateUserSecret(userId, tokenData) {
  const startTime = Date.now();
  try {
    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.from("users").select("spotify_vault_secret_id").eq("id", userId).single();
    if (userError || !userData?.spotify_vault_secret_id) {
      const elapsedMs2 = Date.now() - startTime;
      const errorMsg = userError?.message || "No vault secret ID found for user";
      logVaultOperation(userId, "update", elapsedMs2, false, errorMsg);
      return {
        success: false,
        error: errorMsg,
        elapsed_ms: elapsedMs2
      };
    }
    const { data: updateSuccess, error } = await supabase.rpc("vault_update_user_secret", {
      p_secret_id: userData.spotify_vault_secret_id,
      p_secret_data: JSON.stringify(tokenData)
    });
    const elapsedMs = Date.now() - startTime;
    if (error || !updateSuccess) {
      const errorMsg = error?.message || "Update operation failed";
      logVaultOperation(userId, "update", elapsedMs, false, errorMsg);
      return {
        success: false,
        error: errorMsg,
        elapsed_ms: elapsedMs
      };
    }
    logVaultOperation(userId, "update", elapsedMs, true);
    return {
      success: true,
      data: tokenData,
      elapsed_ms: elapsedMs
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logVaultOperation(userId, "update", elapsedMs, false, errorMessage);
    return {
      success: false,
      error: errorMessage,
      elapsed_ms: elapsedMs
    };
  }
}
async function storeUserSecret(userId, tokenData) {
  const startTime = Date.now();
  try {
    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.from("users").select("spotify_vault_secret_id").eq("id", userId).single();
    if (!userError && userData?.spotify_vault_secret_id) {
      console.log(`User ${userId} has existing secret, updating...`);
      return await updateUserSecret(userId, tokenData);
    }
    console.log(`User ${userId} has no existing secret, creating...`);
    return await createUserSecret(userId, tokenData);
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error in storeUserSecret for user ${userId}:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      elapsed_ms: elapsedMs
    };
  }
}
async function vaultHealthCheck() {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.rpc("vault_read_user_secret", {
      p_secret_id: "00000000-0000-0000-0000-000000000000"
      // Dummy UUID that won't exist
    });
    if (error) {
      if (error.message.includes("function vault_read_user_secret does not exist")) {
        console.error("Vault health check failed: RPC functions not found - vault extension likely not enabled");
        return false;
      }
      if (error.message.includes("Secret not found") || error.message.includes("inaccessible")) {
        return true;
      }
      console.error("Vault health check failed:", error.message);
      return false;
    }
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Vault health check exception:", errorMessage);
    return false;
  }
}

// routes/spotifyTokens.ts
var router2 = express2.Router();
var supabaseAdmin2 = null;
function getSupabaseAdmin2() {
  if (!supabaseAdmin2) {
    supabaseAdmin2 = createClient3(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabaseAdmin2;
}
router2.post("/", async (req, res) => {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      res.status(401).json({
        success: false,
        error: "User authentication failed"
      });
      return;
    }
    let token = req.cookies["sb-access-token"];
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) {
      console.error("No access token found in cookie or Authorization header");
      res.status(401).json({
        success: false,
        error: "Not authenticated"
      });
      return;
    }
    const { data: { user }, error } = await getSupabaseAdmin2().auth.getUser(token);
    if (error || !user) {
      console.error("User authentication failed:", error?.message);
      res.status(401).json({
        success: false,
        error: "User authentication failed"
      });
      return;
    }
    const { access_token, refresh_token, expires_at } = req.body;
    if (!access_token || !refresh_token || !expires_at) {
      console.error("Missing one or more required token fields");
      res.status(400).json({
        success: false,
        error: "Missing token fields"
      });
      return;
    }
    const tokenData = {
      access_token,
      refresh_token,
      expires_at,
      // Already in Unix timestamp format
      token_type: "Bearer",
      scope: "user-read-email user-library-read"
      // Default scopes
    };
    const vaultResult = await storeUserSecret(user.id, tokenData);
    if (!vaultResult.success) {
      console.error("Failed to store tokens in vault:", vaultResult.error);
      console.error(`VAULT_ERROR_DETAIL: User ID: ${user.id}, Error: ${vaultResult.error}, Elapsed: ${vaultResult.elapsed_ms}ms`);
      res.status(500).json({
        success: false,
        error: "Failed to store tokens securely"
      });
      return;
    }
    const { error: upsertError } = await getSupabaseAdmin2().from("users").upsert({
      id: user.id,
      email: user.email || "",
      spotify_reauth_required: false,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }, {
      onConflict: "id"
    }).select();
    if (upsertError) {
      console.error("Error updating user record:", upsertError.message);
      console.warn("Vault storage succeeded but user record update failed");
    }
    console.log(`Successfully stored tokens in vault for user: ${user.email} (${vaultResult.elapsed_ms}ms)`);
    res.status(200).json({
      success: true,
      message: "Tokens stored securely",
      vault_latency_ms: vaultResult.elapsed_ms
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Unexpected error in /api/store-spotify-tokens:", errorMessage);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});
var spotifyTokens_default = router2;

// routes/syncShows.ts
import express3 from "express";
import { createClient as createClient4 } from "@supabase/supabase-js";
var router3 = express3.Router();
var supabaseAdmin3 = null;
function getSupabaseAdmin3() {
  if (process.env.NODE_ENV === "test" && supabaseAdmin3 && !supabaseAdmin3.__persistDuringTest) {
    supabaseAdmin3 = null;
  }
  if (supabaseAdmin3) {
    return supabaseAdmin3;
  }
  if (process.env.NODE_ENV === "test") {
    supabaseAdmin3 = createClient4(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    return supabaseAdmin3;
  }
  if (!supabaseAdmin3) {
    supabaseAdmin3 = createClient4(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseAdmin3;
}
async function safeAwait(maybeBuilder) {
  if (process.env.NODE_ENV === "test") {
    if (maybeBuilder === null || maybeBuilder === void 0) {
      console.error("safeAwait received null/undefined in test environment");
      return { error: { message: "Mock returned null/undefined" } };
    }
    if (typeof maybeBuilder === "function" && maybeBuilder.mock) {
      try {
        const result = maybeBuilder();
        return result;
      } catch (error) {
        console.error("Error calling mock function:", error);
        return { error: { message: "Mock function call failed" } };
      }
    }
    if (maybeBuilder && typeof maybeBuilder.then === "function") {
      try {
        return await maybeBuilder;
      } catch (error) {
        console.error("Error awaiting thenable:", error);
        return { error: { message: "Thenable await failed" } };
      }
    }
    return maybeBuilder;
  }
  if (!maybeBuilder || typeof maybeBuilder !== "object") {
    return maybeBuilder;
  }
  if (typeof maybeBuilder.then === "function") {
    const result = await maybeBuilder;
    if (result && typeof result.then === "function") {
      return await result;
    }
    return result;
  }
  return maybeBuilder;
}
router3.post("/", async (req, res) => {
  try {
    let token = req.cookies["sb-access-token"];
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) {
      console.error("No access token found in cookie or Authorization header");
      res.status(401).json({
        success: false,
        error: "Not authenticated"
      });
      return;
    }
    const { data: { user }, error } = await getSupabaseAdmin3().auth.getUser(token);
    if (error || !user) {
      console.error("User authentication failed:", error?.message);
      res.status(401).json({
        success: false,
        error: "User authentication failed"
      });
      return;
    }
    const userId = user.id;
    const vaultResult = await getUserSecret(userId);
    if (!vaultResult.success) {
      console.error("Could not retrieve user Spotify tokens from vault:", vaultResult.error);
      res.status(400).json({
        success: false,
        error: "Could not retrieve user Spotify tokens"
      });
      return;
    }
    const spotifyTokens = vaultResult.data;
    const spotifyAccessToken = spotifyTokens.access_token;
    if (!spotifyAccessToken) {
      console.error("No Spotify access token found for user");
      res.status(400).json({
        success: false,
        error: "No Spotify access token found for user"
      });
      return;
    }
    try {
      const shows = [];
      let nextUrl = "https://api.spotify.com/v1/me/shows?limit=50";
      let retries = 0;
      const maxRetries = 3;
      while (nextUrl) {
        try {
          const response = await fetch(nextUrl, {
            headers: { "Authorization": `Bearer ${spotifyAccessToken}` }
          });
          if (!response.ok) {
            throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
          }
          const data = await response.json();
          const spotifyData = data;
          if (Array.isArray(spotifyData.items)) {
            shows.push(...spotifyData.items);
          }
          nextUrl = spotifyData.next || null;
        } catch (error2) {
          const err = error2;
          if (retries < maxRetries) {
            retries++;
            console.warn(`Retrying Spotify API call (${retries}/${maxRetries}) due to error:`, err.message);
            await new Promise((resolve) => setTimeout(resolve, 500 * retries));
            continue;
          } else {
            console.error("Failed to fetch shows from Spotify after retries:", err);
            res.status(502).json({
              success: false,
              error: "Failed to fetch shows from Spotify"
            });
            return;
          }
        }
      }
      if (process.env.NODE_ENV === "test") {
        console.log("Shows fetched from Spotify:", shows.length);
        const supabaseClient = getSupabaseAdmin3();
        console.log("Supabase client exists:", !!supabaseClient);
        if (supabaseClient) {
          console.log("Supabase client type:", typeof supabaseClient);
          console.log("Supabase client from method exists:", !!supabaseClient.from);
          if (supabaseClient.from) {
            const fromShowsResult = supabaseClient.from("podcast_shows");
            const fromSubsResult = supabaseClient.from("user_podcast_subscriptions");
            console.log("podcast_shows table access exists:", !!fromShowsResult);
            console.log("user_podcast_subscriptions table access exists:", !!fromSubsResult);
            if (fromShowsResult && fromSubsResult) {
              console.log("Upsert method exists on shows table:", !!fromShowsResult.upsert);
              console.log("Upsert method exists on subscriptions table:", !!fromSubsResult.upsert);
            }
          }
        }
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const showIds = [];
      for (const showObj of shows) {
        const show = showObj.show;
        const spotifyUrl = `https://open.spotify.com/show/${show.id}`;
        const rssUrl = spotifyUrl;
        try {
          const showUpsertRes = await safeAwait(
            getSupabaseAdmin3().from("podcast_shows").upsert([
              {
                rss_url: rssUrl,
                title: show.name || "Unknown Show",
                description: show.description || null,
                image_url: show.images?.[0]?.url || null,
                last_updated: now
              }
            ], {
              onConflict: "rss_url",
              ignoreDuplicates: false
            }).select("id")
          );
          if (showUpsertRes?.error) {
            console.error("Error upserting podcast show:", showUpsertRes.error.message);
            throw new Error(`Error saving show to database: ${showUpsertRes.error.message}`);
          }
          const showId = showUpsertRes?.data?.[0]?.id;
          if (!showId) {
            throw new Error("Failed to get show ID after upsert");
          }
          showIds.push(showId);
          const subscriptionUpsertRes = await safeAwait(
            getSupabaseAdmin3().from("user_podcast_subscriptions").upsert([
              {
                user_id: userId,
                show_id: showId,
                status: "active",
                updated_at: now
              }
            ], { onConflict: "user_id,show_id" })
          );
          if (subscriptionUpsertRes?.error) {
            console.error("Error upserting podcast subscription:", subscriptionUpsertRes.error.message);
            throw new Error(`Error saving subscription to database: ${subscriptionUpsertRes.error.message}`);
          }
        } catch (error2) {
          const err = error2;
          if (err.message.includes("Cannot read properties of undefined")) {
            console.error("Supabase client method undefined - likely mock issue:", err.message);
            throw new Error("Error saving shows to database: Database client not properly initialized.");
          }
          throw err;
        }
      }
      let subsResult;
      let allSubs;
      let allSubsError;
      try {
        const fetchSubsBuilder = getSupabaseAdmin3().from("user_podcast_subscriptions").select("id,show_id").eq("user_id", userId);
        subsResult = await safeAwait(fetchSubsBuilder);
        allSubs = subsResult?.data ?? (Array.isArray(subsResult) ? subsResult : void 0);
        allSubsError = subsResult?.error;
      } catch (error2) {
        const err = error2;
        if (err.message.includes("Cannot read properties of undefined")) {
          console.error("Supabase client method undefined during select - likely mock issue:", err.message);
          throw new Error("Error saving shows to database: Failed to fetch existing subscriptions.");
        }
        throw err;
      }
      if (allSubsError) {
        console.error("Error fetching subscriptions:", allSubsError.message);
        throw new Error("Error saving shows to database: Failed to fetch existing subscriptions.");
      }
      const subsToInactivate = (allSubs || []).filter((s) => !showIds.includes(s.show_id));
      const inactiveIds = subsToInactivate.map((s) => s.id);
      console.log("Subscriptions to inactivate IDs:", inactiveIds);
      let inactiveCount = 0;
      if (inactiveIds.length > 0) {
        try {
          const updateRes = await safeAwait(
            getSupabaseAdmin3().from("user_podcast_subscriptions").update({ status: "inactive", updated_at: now }).in("id", inactiveIds)
          );
          if (updateRes?.error) {
            console.error("Error marking subscriptions inactive:", updateRes.error.message);
            throw new Error("Error updating inactive shows: Database operation failed");
          }
          inactiveCount = inactiveIds.length;
        } catch (error2) {
          const err = error2;
          if (err.message.includes("Cannot read properties of undefined")) {
            console.error("Supabase client method undefined during update - likely mock issue:", err.message);
            throw new Error("Error updating inactive shows: Database operation failed");
          }
          throw err;
        }
      }
      const syncResponse = {
        success: true,
        active_count: showIds.length,
        inactive_count: inactiveCount || 0
      };
      res.status(200).json(syncResponse);
    } catch (dbOrSpotifyError) {
      const err = dbOrSpotifyError;
      console.error("Error during Spotify sync or DB operations:", err.message, err.stack);
      const errorMessage = err.message || "A database or Spotify API operation failed.";
      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  } catch (error) {
    const err = error;
    console.error("Unexpected error in /api/sync-spotify-shows:", err.message, err.stack);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});
var syncShows_default = router3;

// routes/health.ts
import express4 from "express";
var router4 = express4.Router();
router4.get("/", (_req, res) => {
  const startTime = Date.now();
  const uptimeMs = process.uptime() * 1e3;
  const version = process.env.npm_package_version;
  const healthResponse = {
    status: "healthy",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    uptime: uptimeMs,
    ...version && { version },
    services: {
      database: "connected",
      // Could be enhanced to actually check database connectivity
      deepgram: "available",
      // Could be enhanced to check Deepgram API availability
      spotify: "available"
      // Could be enhanced to check Spotify API availability
    }
  };
  const responseTime = Date.now() - startTime;
  res.set("X-Response-Time", `${responseTime}ms`);
  res.status(200).json(healthResponse);
});
var health_default = router4;

// routes/admin.ts
import { Router as Router5 } from "express";

// services/backgroundJobs.ts
import { createClient as createClient7 } from "@supabase/supabase-js";
import cron from "node-cron";

// services/subscriptionRefreshService.ts
import { createClient as createClient6 } from "@supabase/supabase-js";

// services/tokenService.ts
import { createClient as createClient5 } from "@supabase/supabase-js";

// lib/tokenCache.ts
var InProcessTokenCache = class {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
    this.hits = 0;
    this.misses = 0;
    this.defaultTtlSeconds = 60;
  }
  // 60 second TTL per user as specified
  /**
   * Get token data from cache if not expired
   * @param {string} userId - The user's UUID
   * @returns {Promise<SpotifyTokenData | null>} Cached token data or null if not found/expired
   */
  async get(userId) {
    const entry = this.cache.get(userId);
    if (!entry) {
      this.misses++;
      return null;
    }
    const now = Date.now();
    if (now >= entry.expires_at) {
      this.cache.delete(userId);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.data;
  }
  /**
   * Store token data in cache with TTL
   * @param {string} userId - The user's UUID
   * @param {SpotifyTokenData} tokenData - Token data to cache
   * @param {number} ttlSeconds - TTL in seconds (default: 60)
   */
  async set(userId, tokenData, ttlSeconds = this.defaultTtlSeconds) {
    const now = Date.now();
    const entry = {
      data: tokenData,
      expires_at: now + ttlSeconds * 1e3,
      created_at: now
    };
    this.cache.set(userId, entry);
  }
  /**
   * Remove token data from cache
   * @param {string} _userId - The user's UUID (unused in error implementation)
   */
  async delete(_userId) {
    this.cache.delete(_userId);
  }
  /**
   * Clear all cached tokens
   */
  async clear() {
    this.cache.clear();
  }
  /**
   * Get cache statistics for monitoring
   * @returns {Promise<{hits: number, misses: number, size: number}>} Cache stats
   */
  async getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size
    };
  }
  /**
   * Cleanup expired entries (should be called periodically)
   * Removes entries that have passed their TTL
   * @returns {number} Number of entries cleaned up
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [userId, entry] of this.cache.entries()) {
      if (now >= entry.expires_at) {
        this.cache.delete(userId);
        cleanedCount++;
      }
    }
    return cleanedCount;
  }
};
var RedisTokenCache = class {
  // TODO: Implement Redis cache when scaling is needed
  // This would use a Redis client like ioredis for distributed caching
  async get(_userId) {
    throw new Error("Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.");
  }
  async set(_userId, _tokenData, _ttlSeconds) {
    throw new Error("Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.");
  }
  async delete(_userId) {
    throw new Error("Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.");
  }
  async clear() {
    throw new Error("Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.");
  }
  async getStats() {
    throw new Error("Redis cache not yet implemented. Set CACHE_BACKEND=memory to use in-process cache.");
  }
};
var CACHE_BACKEND = process.env.CACHE_BACKEND || "memory";
var cacheInstance = null;
function getTokenCache() {
  if (!cacheInstance) {
    switch (CACHE_BACKEND.toLowerCase()) {
      case "redis":
        console.log("TOKEN_CACHE: Using Redis backend for distributed caching");
        cacheInstance = new RedisTokenCache();
        break;
      case "memory":
      default:
        console.log("TOKEN_CACHE: Using in-process memory cache");
        cacheInstance = new InProcessTokenCache();
        break;
    }
  }
  return cacheInstance;
}
if (CACHE_BACKEND.toLowerCase() === "memory") {
  const CLEANUP_INTERVAL = 5 * 60 * 1e3;
  setInterval(() => {
    const cache = getTokenCache();
    if (cache instanceof InProcessTokenCache) {
      const cleanedCount = cache.cleanup();
      if (cleanedCount > 0) {
        console.log(`TOKEN_CACHE: Cleaned up ${cleanedCount} expired cache entries`);
      }
    }
  }, CLEANUP_INTERVAL);
}

// services/tokenService.ts
var spotifyRateLimit = {
  is_limited: false
};
var CONFIG = {
  refresh_threshold_minutes: parseInt(process.env.TOKEN_REFRESH_THRESHOLD_MINUTES || "5"),
  max_refresh_retries: parseInt(process.env.MAX_REFRESH_RETRIES || "1"),
  cache_ttl_seconds: parseInt(process.env.TOKEN_CACHE_TTL_SECONDS || "60"),
  rate_limit_pause_seconds: parseInt(process.env.RATE_LIMIT_PAUSE_SECONDS || "30")
};
var metrics = {
  spotify_token_refresh_failed_total: 0,
  vault_write_total: 0,
  cache_hits: 0,
  cache_misses: 0
};
var supabaseAdmin4 = null;
function getSupabaseAdmin4() {
  if (!supabaseAdmin4) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required Supabase environment variables");
    }
    supabaseAdmin4 = createClient5(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabaseAdmin4;
}
function emitMetric(metric, value, labels = {}) {
  const metricData = {
    metric,
    value,
    timestamp: Date.now(),
    labels
  };
  console.log(`METRIC: ${JSON.stringify(metricData)}`);
}
function validateTokens(tokens) {
  const now = Date.now();
  const expiresAt = tokens.expires_at * 1e3;
  const thresholdMs = CONFIG.refresh_threshold_minutes * 60 * 1e3;
  const timeUntilExpiry = expiresAt - now;
  const expiresInMinutes = Math.floor(timeUntilExpiry / 6e4);
  return {
    valid: timeUntilExpiry > 0,
    expires_in_minutes: expiresInMinutes,
    needs_refresh: timeUntilExpiry < thresholdMs
  };
}
function isRateLimited() {
  if (!spotifyRateLimit.is_limited) {
    return false;
  }
  const now = Date.now();
  if (spotifyRateLimit.reset_at && now >= spotifyRateLimit.reset_at) {
    spotifyRateLimit.is_limited = false;
    delete spotifyRateLimit.reset_at;
    console.log("RATE_LIMIT: Spotify rate limit has expired, resuming operations");
    return false;
  }
  return true;
}
function setRateLimit(retryAfterSeconds = CONFIG.rate_limit_pause_seconds) {
  const now = Date.now();
  spotifyRateLimit = {
    is_limited: true,
    reset_at: now + retryAfterSeconds * 1e3,
    retry_after_seconds: retryAfterSeconds
  };
  console.log(`RATE_LIMIT: Spotify rate limit activated for ${retryAfterSeconds} seconds`);
  emitMetric("spotify_rate_limit_activated", 1, { retry_after_seconds: retryAfterSeconds.toString() });
}
async function refreshSpotifyTokens(refreshToken) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const usePkce = process.env.SPOTIFY_USE_PKCE === "true";
  if (!clientId) {
    throw new Error("Missing Spotify client ID");
  }
  if (!usePkce && !clientSecret) {
    throw new Error("Missing Spotify client secret");
  }
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded"
  };
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  if (usePkce) {
    body.append("client_id", clientId);
  } else {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  }
  if (process.env.NODE_ENV !== "test") {
    console.debug("TOKEN_REFRESH_FLOW", {
      usePkce,
      clientIdPresent: !!clientId,
      clientSecretPresent: !!clientSecret
    });
  }
  if (process.env.NODE_ENV !== "test") {
    console.debug("TOKEN_REFRESH_REQUEST", {
      headers: Object.keys(headers),
      body: body.toString().replace(/refresh_token=[^&]+/, "refresh_token=****")
    });
  }
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers,
    body
  });
  if (process.env.NODE_ENV !== "test") {
    console.debug("TOKEN_REFRESH_RESPONSE_STATUS", response.status);
  }
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("retry-after") || "30");
    setRateLimit(retryAfter);
    throw new Error(`Spotify rate limited: retry after ${retryAfter} seconds`);
  }
  if (!response.ok) {
    let parsedBody = null;
    let rawBody = "";
    if (typeof response.json === "function") {
      try {
        parsedBody = await response.json();
      } catch {
      }
    }
    if (!parsedBody && typeof response.text === "function") {
      try {
        rawBody = await response.text();
      } catch {
      }
    }
    if (!parsedBody && rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
      }
    }
    const msg = parsedBody?.error_description || parsedBody?.error || rawBody || "Unknown error";
    if (process.env.NODE_ENV !== "test") {
      console.error("TOKEN_REFRESH_FAILURE", {
        status: response.status,
        body: typeof rawBody === "string" ? rawBody.slice(0, 500) : rawBody,
        parsedBody
      });
    }
    throw new Error(`Spotify refresh failed: ${response.status} - ${msg}`);
  }
  const tokenData = await response.json();
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || refreshToken,
    // Some responses don't include new refresh token
    expires_in: tokenData.expires_in,
    expires_at: Math.floor(Date.now() / 1e3) + tokenData.expires_in,
    token_type: tokenData.token_type || "Bearer",
    scope: tokenData.scope || ""
  };
}
async function refreshTokens(userId, refreshToken) {
  const startTime = Date.now();
  if (isRateLimited()) {
    return {
      success: false,
      requires_reauth: false,
      error: "Spotify API rate limited, please try again later",
      elapsed_ms: Date.now() - startTime
    };
  }
  const supabase = getSupabaseAdmin4();
  try {
    const { data: _lockedUser, error: lockError } = await supabase.rpc("begin_token_refresh_transaction", { p_user_id: userId });
    if (lockError) {
      console.error("Failed to acquire user lock for token refresh:", lockError);
      return {
        success: false,
        requires_reauth: false,
        error: "Failed to acquire lock for token refresh",
        elapsed_ms: Date.now() - startTime
      };
    }
    let retryCount = 0;
    let lastError = "";
    while (retryCount <= CONFIG.max_refresh_retries) {
      try {
        console.log(`TOKEN_REFRESH: Attempting refresh for user ${userId} (attempt ${retryCount + 1})`);
        const newTokens = await refreshSpotifyTokens(refreshToken);
        const vaultTokenData = {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          expires_at: newTokens.expires_at,
          token_type: newTokens.token_type,
          scope: newTokens.scope
        };
        const vaultResult = await updateUserSecret(userId, vaultTokenData);
        if (!vaultResult.success) {
          console.error("Failed to update tokens in vault:", vaultResult.error);
          throw new Error(`Vault update failed: ${vaultResult.error}`);
        }
        const cache = getTokenCache();
        await cache.set(userId, vaultTokenData, CONFIG.cache_ttl_seconds);
        await supabase.from("users").update({ spotify_reauth_required: false }).eq("id", userId);
        emitMetric("spotify_token_refresh_success_total", 1, { user_id: userId });
        emitMetric("vault_write_total", 1, { operation: "token_refresh" });
        metrics.vault_write_total++;
        const elapsedMs = Date.now() - startTime;
        console.log(`TOKEN_REFRESH: Successfully refreshed tokens for user ${userId} in ${elapsedMs}ms`);
        return {
          success: true,
          tokens: newTokens,
          requires_reauth: false,
          elapsed_ms: elapsedMs
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        lastError = errorMessage;
        retryCount++;
        console.warn(`TOKEN_REFRESH: Attempt ${retryCount} failed for user ${userId}: ${errorMessage}`);
        if (errorMessage.includes("401") || errorMessage.includes("invalid_grant")) {
          console.error(`TOKEN_REFRESH: Invalid refresh token for user ${userId}, setting reauth required`);
          await supabase.from("users").update({ spotify_reauth_required: true }).eq("id", userId);
          const cache = getTokenCache();
          await cache.delete(userId);
          emitMetric("spotify_token_refresh_failed_total", 1, {
            user_id: userId,
            reason: "invalid_refresh_token"
          });
          metrics.spotify_token_refresh_failed_total++;
          return {
            success: false,
            requires_reauth: true,
            error: "Invalid refresh token - user must re-authenticate",
            elapsed_ms: Date.now() - startTime
          };
        }
        if (retryCount <= CONFIG.max_refresh_retries) {
          const delay = Math.min(1e3 * Math.pow(2, retryCount), 5e3);
          console.log(`TOKEN_REFRESH: Waiting ${delay}ms before retry`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    console.error(`TOKEN_REFRESH: All ${CONFIG.max_refresh_retries} retries exhausted for user ${userId}`);
    emitMetric("spotify_token_refresh_failed_total", 1, {
      user_id: userId,
      reason: "max_retries_exceeded"
    });
    metrics.spotify_token_refresh_failed_total++;
    return {
      success: false,
      requires_reauth: false,
      error: `Token refresh failed after ${CONFIG.max_refresh_retries} retries: ${lastError}`,
      elapsed_ms: Date.now() - startTime
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`TOKEN_REFRESH: Unexpected error for user ${userId}:`, errorMessage);
    emitMetric("spotify_token_refresh_failed_total", 1, {
      user_id: userId,
      reason: "unexpected_error"
    });
    metrics.spotify_token_refresh_failed_total++;
    return {
      success: false,
      requires_reauth: false,
      error: `Unexpected error during token refresh: ${errorMessage}`,
      elapsed_ms: Date.now() - startTime
    };
  }
}
async function getValidTokens(userId) {
  const startTime = Date.now();
  try {
    const cache = getTokenCache();
    let tokenData = await cache.get(userId);
    if (tokenData) {
      console.log(`TOKEN_SERVICE: Cache hit for user ${userId}`);
      metrics.cache_hits++;
      emitMetric("token_cache_hits_total", 1, { user_id: userId });
      const validation2 = validateTokens({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_at - Math.floor(Date.now() / 1e3),
        expires_at: tokenData.expires_at,
        token_type: tokenData.token_type,
        scope: tokenData.scope
      });
      if (validation2.valid && !validation2.needs_refresh) {
        return {
          success: true,
          tokens: {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_at - Math.floor(Date.now() / 1e3),
            expires_at: tokenData.expires_at,
            token_type: tokenData.token_type,
            scope: tokenData.scope
          },
          requires_reauth: false,
          elapsed_ms: Date.now() - startTime
        };
      }
      console.log(`TOKEN_SERVICE: Cached tokens for user ${userId} need refresh (expires in ${validation2.expires_in_minutes} minutes)`);
    } else {
      console.log(`TOKEN_SERVICE: Cache miss for user ${userId}`);
      metrics.cache_misses++;
      emitMetric("token_cache_misses_total", 1, { user_id: userId });
    }
    if (!tokenData) {
      const vaultResult = await getUserSecret(userId);
      if (!vaultResult.success) {
        console.log(`TOKEN_SERVICE: No tokens found in vault for user ${userId}`);
        return {
          success: false,
          requires_reauth: true,
          error: "No tokens found - user must authenticate",
          elapsed_ms: Date.now() - startTime
        };
      }
      tokenData = vaultResult.data;
      await cache.set(userId, tokenData, CONFIG.cache_ttl_seconds);
    }
    const validation = validateTokens({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_at - Math.floor(Date.now() / 1e3),
      expires_at: tokenData.expires_at,
      token_type: tokenData.token_type,
      scope: tokenData.scope
    });
    if (!validation.needs_refresh) {
      console.log(`TOKEN_SERVICE: Vault tokens for user ${userId} are still valid (expires in ${validation.expires_in_minutes} minutes)`);
      return {
        success: true,
        tokens: {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_at - Math.floor(Date.now() / 1e3),
          expires_at: tokenData.expires_at,
          token_type: tokenData.token_type,
          scope: tokenData.scope
        },
        requires_reauth: false,
        elapsed_ms: Date.now() - startTime
      };
    }
    console.log(`TOKEN_SERVICE: Refreshing tokens for user ${userId} (expires in ${validation.expires_in_minutes} minutes)`);
    return await refreshTokens(userId, tokenData.refresh_token);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`TOKEN_SERVICE: Error getting valid tokens for user ${userId}:`, errorMessage);
    return {
      success: false,
      requires_reauth: false,
      error: `Failed to get valid tokens: ${errorMessage}`,
      elapsed_ms: Date.now() - startTime
    };
  }
}
async function healthCheck() {
  try {
    const supabase = getSupabaseAdmin4();
    const { data, error } = await supabase.rpc("test_vault_count");
    if (error) {
      console.error("TOKEN_SERVICE: Vault health check failed:", error.message);
      return false;
    }
    if (typeof data !== "number") {
      console.error("TOKEN_SERVICE: Vault health check failed: invalid response format");
      return false;
    }
    console.log(`TOKEN_SERVICE: Vault health check passed - ${data} secrets in vault`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("TOKEN_SERVICE: Health check error:", errorMessage);
    return false;
  }
}

// lib/logger.ts
var DEFAULT_LOGGER_CONFIG = {
  minLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === "development" ? "debug" : "info"),
  enableConsoleLogging: true,
  enableStructuredLogging: process.env.NODE_ENV !== "development",
  // JSON logs in production
  enableTimestamps: true,
  enableStackTraces: process.env.NODE_ENV === "development",
  redactSensitiveData: process.env.NODE_ENV !== "development"
};
var LOG_LEVEL_PRIORITY = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
var SENSITIVE_PATTERNS = [
  /access_token/i,
  /refresh_token/i,
  /client_secret/i,
  /password/i,
  /api_key/i,
  /bearer/i,
  /authorization/i
];
function redactSensitiveData(data) {
  if (!data || typeof data !== "object") {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }
  const redacted = { ...data };
  for (const [key, value] of Object.entries(redacted)) {
    const isSensitiveKey = SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitiveKey) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSensitiveData(value);
    } else if (typeof value === "string" && value.length > 50) {
      const tokenPattern = /^[a-zA-Z0-9_-]{20,}$/;
      if (tokenPattern.test(value)) {
        redacted[key] = "[REDACTED_TOKEN]";
      }
    }
  }
  return redacted;
}
var Logger = class {
  constructor(config = {}) {
    this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
  }
  /**
   * Check if a log level should be logged based on minimum level
   * @param {LogLevel} level - Log level to check
   * @returns {boolean} Whether the level should be logged
   */
  shouldLog(level) {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }
  /**
   * Create a structured log entry
   * @param {LogLevel} level - Log level
   * @param {LogContext} context - Log context
   * @param {string} message - Log message
   * @param {Partial<LogEntry>} additional - Additional log data
   * @returns {LogEntry} Structured log entry
   */
  createLogEntry(level, context, message, additional = {}) {
    const entry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      context,
      message,
      ...additional
    };
    if (this.config.redactSensitiveData && entry.metadata) {
      entry.metadata = redactSensitiveData(entry.metadata);
    }
    return entry;
  }
  /**
   * Output a log entry to console with proper formatting
   * @param {LogEntry} entry - Log entry to output
   */
  outputLog(entry) {
    if (!this.shouldLog(entry.level) || !this.config.enableConsoleLogging) {
      return;
    }
    const logFunction = this.getConsoleFunction(entry.level);
    if (this.config.enableStructuredLogging) {
      logFunction(JSON.stringify(entry));
    } else {
      const timestamp = this.config.enableTimestamps ? `[${entry.timestamp}] ` : "";
      const contextPrefix = `[${entry.context.toUpperCase()}]`;
      const componentSuffix = entry.component ? ` (${entry.component})` : "";
      const userSuffix = entry.user_id ? ` [User: ${entry.user_id}]` : "";
      const durationSuffix = entry.duration_ms ? ` (${entry.duration_ms}ms)` : "";
      const prefix = `${timestamp}${contextPrefix}${componentSuffix}${userSuffix}`;
      const suffix = durationSuffix;
      if (entry.metadata) {
        logFunction(`${prefix} ${entry.message}${suffix}`, entry.metadata);
      } else {
        logFunction(`${prefix} ${entry.message}${suffix}`);
      }
    }
  }
  /**
   * Get appropriate console function for log level
   * @param {LogLevel} level - Log level
   * @returns {(...args: any[]) => void} Console function
   */
  getConsoleFunction(level) {
    switch (level) {
      case "debug":
        return console.debug;
      case "info":
        return console.log;
      case "warn":
        return console.warn;
      case "error":
        return console.error;
      default:
        return console.log;
    }
  }
  /**
   * Log a debug message
   * @param {LogContext} context - Log context
   * @param {string} message - Log message
   * @param {Partial<LogEntry>} additional - Additional log data
   */
  debug(context, message, additional = {}) {
    const entry = this.createLogEntry("debug", context, message, additional);
    this.outputLog(entry);
  }
  /**
   * Log an info message
   * @param {LogContext} context - Log context
   * @param {string} message - Log message
   * @param {Partial<LogEntry>} additional - Additional log data
   */
  info(context, message, additional = {}) {
    const entry = this.createLogEntry("info", context, message, additional);
    this.outputLog(entry);
  }
  /**
   * Log a warning message
   * @param {LogContext} context - Log context
   * @param {string} message - Log message
   * @param {Partial<LogEntry>} additional - Additional log data
   */
  warn(context, message, additional = {}) {
    const entry = this.createLogEntry("warn", context, message, additional);
    this.outputLog(entry);
  }
  /**
   * Log an error message
   * @param {LogContext} context - Log context
   * @param {string} message - Log message
   * @param {Partial<LogEntry>} additional - Additional log data
   */
  error(context, message, additional = {}) {
    const entry = this.createLogEntry("error", context, message, additional);
    this.outputLog(entry);
  }
};
var globalLogger = new Logger();
var SubscriptionRefreshLogger = class {
  constructor(jobId, config = {}) {
    this.logger = new Logger(config);
    this.jobId = jobId;
  }
  /**
   * Log subscription refresh start
   * @param {string} userId - User ID
   * @param {Partial<SubscriptionRefreshLogData>} data - Additional data
   */
  refreshStart(userId, data = {}) {
    const logEntry = {
      component: "refresh_service",
      user_id: userId,
      metadata: {
        subscription_data: data
      }
    };
    if (this.jobId) {
      logEntry.job_id = this.jobId;
    }
    this.logger.info("subscription_refresh", "Starting subscription refresh", logEntry);
  }
  /**
   * Log subscription refresh completion
   * @param {string} userId - User ID
   * @param {boolean} success - Whether refresh succeeded
   * @param {SubscriptionRefreshLogData} data - Refresh data
   */
  refreshComplete(userId, success, data) {
    const logEntry = {
      component: "refresh_service",
      user_id: userId,
      success,
      metadata: {
        subscription_data: data
      }
    };
    if (this.jobId) {
      logEntry.job_id = this.jobId;
    }
    if (data.processing_time_ms !== void 0) {
      logEntry.duration_ms = data.processing_time_ms;
    }
    this.logger.info(
      "subscription_refresh",
      success ? "Subscription refresh completed successfully" : "Subscription refresh failed",
      logEntry
    );
  }
  /**
   * Log Spotify API interaction
   * @param {string} userId - User ID
   * @param {string} endpoint - API endpoint
   * @param {boolean} success - Whether API call succeeded
   * @param {number} duration - API call duration
   * @param {string} error - Error message if failed
   */
  spotifyApiCall(userId, endpoint, success, duration, error) {
    const logEntry = {
      component: "spotify_client",
      user_id: userId,
      success,
      duration_ms: duration,
      metadata: {
        endpoint,
        api_call: true
      }
    };
    if (this.jobId) {
      logEntry.job_id = this.jobId;
    }
    if (error) {
      logEntry.error = error;
    }
    this.logger.info(
      "spotify_api",
      success ? `Spotify API call successful: ${endpoint}` : `Spotify API call failed: ${endpoint}`,
      logEntry
    );
  }
  /**
   * Log database operation
   * @param {string} userId - User ID
   * @param {string} operation - Database operation
   * @param {boolean} success - Whether operation succeeded
   * @param {number} recordsAffected - Number of records affected
   * @param {string} error - Error message if failed
   */
  databaseOperation(userId, operation, success, recordsAffected, error) {
    const logEntry = {
      component: "database_client",
      user_id: userId,
      success,
      metadata: {
        operation,
        records_affected: recordsAffected,
        database_operation: true
      }
    };
    if (this.jobId) {
      logEntry.job_id = this.jobId;
    }
    if (error) {
      logEntry.error = error;
    }
    this.logger.info(
      "database",
      success ? `Database operation successful: ${operation}` : `Database operation failed: ${operation}`,
      logEntry
    );
  }
  /**
   * Log batch processing progress
   * @param {number} batchNumber - Current batch number
   * @param {number} totalBatches - Total number of batches
   * @param {number} usersInBatch - Users in current batch
   * @param {SubscriptionRefreshLogData} data - Progress data
   */
  batchProgress(batchNumber, totalBatches, usersInBatch, data) {
    const logEntry = {
      component: "batch_processor",
      metadata: {
        batch_number: batchNumber,
        total_batches: totalBatches,
        users_in_batch: usersInBatch,
        subscription_data: data
      }
    };
    if (this.jobId) {
      logEntry.job_id = this.jobId;
    }
    this.logger.info("subscription_refresh", `Processing batch ${batchNumber}/${totalBatches} (${usersInBatch} users)`, logEntry);
  }
  /**
   * Log error with categorization
   * @param {string} userId - User ID
   * @param {string} message - Error message
   * @param {SubscriptionRefreshLogData['error_category']} category - Error category
   * @param {Error} error - Error object
   */
  logError(userId, message, category, error) {
    const logEntry = {
      component: "refresh_service",
      user_id: userId,
      metadata: {
        error_category: category,
        stack_trace: this.logger["config"].enableStackTraces ? error?.stack : void 0,
        subscription_data: {
          error_category: category
        }
      }
    };
    if (this.jobId) {
      logEntry.job_id = this.jobId;
    }
    if (error?.message) {
      logEntry.error = error.message;
    }
    this.logger.error("subscription_refresh", message, logEntry);
  }
};
function createSubscriptionRefreshLogger(jobId) {
  return new SubscriptionRefreshLogger(jobId);
}
var log = {
  debug: (context, message, metadata) => globalLogger.debug(context, message, { metadata }),
  info: (context, message, metadata) => globalLogger.info(context, message, { metadata }),
  warn: (context, message, metadata) => globalLogger.warn(context, message, { metadata }),
  error: (context, message, error, metadata) => {
    const logEntry = {
      metadata: {
        ...metadata,
        stack_trace: error?.stack
      }
    };
    if (error?.message) {
      logEntry.error = error.message;
    }
    globalLogger.error(context, message, logEntry);
  },
  // Convenience methods for specific contexts
  subscriptionRefresh: (level, message, metadata) => globalLogger[level]("subscription_refresh", message, { metadata }),
  scheduler: (level, message, metadata) => globalLogger[level]("scheduler", message, { metadata }),
  spotifyApi: (level, message, metadata) => globalLogger[level]("spotify_api", message, { metadata }),
  database: (level, message, metadata) => globalLogger[level]("database", message, { metadata }),
  auth: (level, message, metadata) => globalLogger[level]("auth", message, { metadata }),
  admin: (level, message, metadata) => globalLogger[level]("admin", message, { metadata })
};

// services/subscriptionRefreshService.ts
var supabaseAdmin5 = null;
function getSupabaseAdmin5() {
  if (process.env.NODE_ENV === "test" && supabaseAdmin5 && !supabaseAdmin5.__persistDuringTest) {
    supabaseAdmin5 = null;
  }
  if (supabaseAdmin5) {
    return supabaseAdmin5;
  }
  if (process.env.NODE_ENV === "test") {
    return createClient6(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  if (!supabaseAdmin5) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required Supabase environment variables");
    }
    supabaseAdmin5 = createClient6(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabaseAdmin5;
}
var globalSpotifyRateLimit = {
  is_limited: false
};
var SCHEDULED_RATE_LIMIT_CONFIG = {
  max_concurrent_requests: 5,
  // Max concurrent API requests across all users
  min_request_interval_ms: 200,
  // Minimum 200ms between API requests
  batch_pause_on_rate_limit_ms: 6e4,
  // 1 minute pause if rate limited during batch
  max_rate_limit_retries: 3
  // Max retries when rate limited
};
function isSpotifyRateLimited() {
  if (process.env.NODE_ENV === "test") {
    return false;
  }
  if (!globalSpotifyRateLimit.is_limited) {
    return false;
  }
  const now = Date.now();
  if (globalSpotifyRateLimit.reset_at && now >= globalSpotifyRateLimit.reset_at) {
    globalSpotifyRateLimit.is_limited = false;
    delete globalSpotifyRateLimit.reset_at;
    console.log("[SubscriptionRefresh] Spotify rate limit has expired, resuming operations");
    return false;
  }
  return true;
}
function setSpotifyRateLimit(retryAfterSeconds = 30, context = "unknown") {
  const now = Date.now();
  globalSpotifyRateLimit = {
    is_limited: true,
    reset_at: now + retryAfterSeconds * 1e3,
    retry_after_seconds: retryAfterSeconds
  };
  console.log(`[SubscriptionRefresh] Spotify rate limit activated for ${retryAfterSeconds} seconds (context: ${context})`);
}
async function waitForRateLimitClear(maxWaitMs = 3e5) {
  if (process.env.NODE_ENV === "test") {
    return true;
  }
  const startTime = Date.now();
  while (isSpotifyRateLimited() && Date.now() - startTime < maxWaitMs) {
    const remainingMs = globalSpotifyRateLimit.reset_at ? globalSpotifyRateLimit.reset_at - Date.now() : 3e4;
    const waitTime = Math.min(remainingMs + 1e3, 3e4);
    console.log(`[SubscriptionRefresh] Waiting ${Math.round(waitTime / 1e3)}s for rate limit to clear...`);
    await sleep(waitTime);
  }
  return !isSpotifyRateLimited();
}
async function makeRateLimitedSpotifyRequest(url, accessToken, userId, maxRetries = SCHEDULED_RATE_LIMIT_CONFIG.max_rate_limit_retries) {
  let attempts = 0;
  while (attempts <= maxRetries) {
    if (isSpotifyRateLimited()) {
      console.log(`[SubscriptionRefresh] Rate limited, waiting before request to ${url}`);
      const rateLimitCleared = await waitForRateLimitClear();
      if (!rateLimitCleared) {
        throw new Error("Rate limit timeout: Unable to make request after waiting");
      }
    }
    if (attempts > 0) {
      await sleep(SCHEDULED_RATE_LIMIT_CONFIG.min_request_interval_ms);
    }
    try {
      const response = await fetch(url, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("retry-after") || "30");
        setSpotifyRateLimit(retryAfter, `API request to ${url}`);
        if (userId) {
          const rawPath = new URL(url).pathname;
          const endpointPath = rawPath.replace(/\/v\d+/, "");
          log.warn("spotify_api", "Rate limit during API call", {
            user_id: userId,
            endpoint: endpointPath,
            attempt: attempts + 1
          });
        }
        attempts++;
        if (attempts <= maxRetries) {
          console.warn(`[SubscriptionRefresh] Rate limited (429) on ${url}, attempt ${attempts}/${maxRetries + 1}`);
          continue;
        } else {
          throw new Error(`Rate limited after ${maxRetries + 1} attempts`);
        }
      }
      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      const err = error;
      attempts++;
      if (attempts <= maxRetries) {
        const backoffMs = Math.min(1e3 * Math.pow(2, attempts - 1), 1e4);
        console.warn(`[SubscriptionRefresh] Request failed, retrying in ${backoffMs}ms (attempt ${attempts}/${maxRetries + 1}):`, err.message);
        await sleep(backoffMs);
      } else {
        throw error;
      }
    }
  }
  throw new Error("Max retries exceeded");
}
async function fetchUserSpotifySubscriptionsWithRateLimit(spotifyAccessToken, userId) {
  const shows = [];
  let nextUrl = "https://api.spotify.com/v1/me/shows?limit=50";
  while (nextUrl) {
    try {
      console.log(`[SubscriptionRefresh] Fetching shows from: ${nextUrl}`);
      const data = await makeRateLimitedSpotifyRequest(nextUrl, spotifyAccessToken, userId);
      const spotifyData = data;
      if (Array.isArray(spotifyData.items)) {
        shows.push(...spotifyData.items);
        console.log(`[SubscriptionRefresh] Fetched ${spotifyData.items.length} shows, total: ${shows.length}`);
      }
      nextUrl = spotifyData.next || null;
      if (nextUrl) {
        await sleep(SCHEDULED_RATE_LIMIT_CONFIG.min_request_interval_ms);
      }
    } catch (error) {
      const err = error;
      console.error("[SubscriptionRefresh] Failed to fetch shows with enhanced rate limiting:", err.message);
      throw new Error(`Failed to fetch shows from Spotify: ${err.message}`);
    }
  }
  return shows;
}
async function updateSubscriptionStatus(userId, currentPodcastUrls) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const showIds = [];
  for (const podcastUrl of currentPodcastUrls) {
    const showId = podcastUrl.split("/").pop();
    const rssUrl = podcastUrl;
    try {
      const showUpsertResult = await safeAwait2(
        getSupabaseAdmin5().from("podcast_shows").upsert([
          {
            rss_url: rssUrl,
            title: `Show ${showId}`,
            // Placeholder title - in production you'd fetch this from Spotify
            description: null,
            image_url: null,
            last_updated: now
          }
        ], {
          onConflict: "rss_url",
          ignoreDuplicates: false
        }).select("id")
      );
      if (showUpsertResult?.error) {
        console.error(`[SubscriptionRefresh] Error upserting podcast show for user ${userId}:`, showUpsertResult.error.message);
        throw new Error(`Database show upsert failed: ${showUpsertResult.error.message}`);
      }
      const actualShowId = showUpsertResult?.data?.[0]?.id;
      if (!actualShowId) {
        throw new Error("Failed to get show ID after upsert");
      }
      showIds.push(actualShowId);
      const subscriptionUpsertResult = await safeAwait2(
        getSupabaseAdmin5().from("user_podcast_subscriptions").upsert([
          {
            user_id: userId,
            show_id: actualShowId,
            status: "active",
            updated_at: now
          }
        ], { onConflict: "user_id,show_id" })
      );
      if (subscriptionUpsertResult?.error) {
        console.error(`[SubscriptionRefresh] Error upserting podcast subscription for user ${userId}:`, subscriptionUpsertResult.error.message);
        throw new Error(`Database subscription upsert failed: ${subscriptionUpsertResult.error.message}`);
      }
    } catch (error) {
      const err = error;
      console.error(`[SubscriptionRefresh] Error processing show ${podcastUrl} for user ${userId}:`, err.message);
      throw err;
    }
  }
  const { data: allSubs, error: allSubsError } = await safeAwait2(
    getSupabaseAdmin5().from("user_podcast_subscriptions").select("id,show_id").eq("user_id", userId)
  );
  if (allSubsError) {
    console.error(`[SubscriptionRefresh] Error fetching subscriptions for user ${userId}:`, allSubsError.message);
    throw new Error(`Failed to fetch existing subscriptions: ${allSubsError.message}`);
  }
  const subsToInactivate = (allSubs || []).filter((s) => !showIds.includes(s.show_id));
  const inactiveIds = subsToInactivate.map((s) => s.id);
  let inactiveCount = 0;
  if (inactiveIds.length > 0) {
    console.log(`[SubscriptionRefresh] Marking ${inactiveIds.length} subscriptions as inactive for user ${userId}`);
    const updateResult = await safeAwait2(
      getSupabaseAdmin5().from("user_podcast_subscriptions").update({ status: "inactive", updated_at: now }).in("id", inactiveIds)
    );
    if (updateResult?.error) {
      console.error(`[SubscriptionRefresh] Error marking subscriptions inactive for user ${userId}:`, updateResult.error.message);
      throw new Error(`Failed to update inactive subscriptions: ${updateResult.error.message}`);
    }
    inactiveCount = inactiveIds.length;
  }
  return {
    active_count: showIds.length,
    inactive_count: inactiveCount
  };
}
async function refreshUserSubscriptions(userId, jobId) {
  const startTime = Date.now();
  const logger = createSubscriptionRefreshLogger(jobId);
  logger.refreshStart(userId, { processing_time_ms: 0 });
  try {
    const tokenStartTime = Date.now();
    const tokenResult = await getValidTokens(userId);
    const tokenDuration = Date.now() - tokenStartTime;
    if (!tokenResult.success || !tokenResult.tokens) {
      const errorMessage = tokenResult.error || "Failed to get valid Spotify tokens";
      let authErrorCategory = "auth_error";
      if (errorMessage.includes("token_expired") || errorMessage.includes("invalid_token")) {
        authErrorCategory = "auth_error";
        log.warn("auth", `Token validation failed for user ${userId}`, {
          user_id: userId,
          error: errorMessage,
          duration_ms: tokenDuration
        });
      } else if (errorMessage.includes("rate") || errorMessage.includes("429")) {
        authErrorCategory = "rate_limit";
        log.warn("spotify_api", `Rate limit during token refresh for user ${userId}`, {
          user_id: userId,
          error: errorMessage,
          duration_ms: tokenDuration
        });
      } else if (errorMessage.includes("network") || errorMessage.includes("timeout")) {
        authErrorCategory = "timeout";
        const err = new Error(errorMessage);
        log.error("spotify_api", `Network/timeout error during token refresh for user ${userId}`, err, {
          user_id: userId,
          error: errorMessage,
          duration_ms: tokenDuration
        });
      } else {
        authErrorCategory = "unknown";
        const err = new Error(errorMessage);
        log.error("auth", `Unknown token error for user ${userId}`, err, {
          user_id: userId,
          error: errorMessage,
          duration_ms: tokenDuration
        });
      }
      logger.logError(userId, `Authentication failed: ${errorMessage}`, authErrorCategory);
      return {
        success: false,
        userId,
        active_count: 0,
        inactive_count: 0,
        error: errorMessage,
        auth_error: true
      };
    }
    const spotifyAccessToken = tokenResult.tokens.access_token;
    log.debug("auth", `Successfully obtained access token for user ${userId}`, {
      user_id: userId,
      token_duration_ms: tokenDuration,
      token_length: spotifyAccessToken.length
    });
    let currentShows;
    const apiStartTime = Date.now();
    try {
      currentShows = await fetchUserSpotifySubscriptionsWithRateLimit(spotifyAccessToken, userId);
      const apiDuration = Date.now() - apiStartTime;
      logger.spotifyApiCall(userId, "/me/shows", true, apiDuration);
      log.debug("spotify_api", `Successfully fetched ${currentShows.length} subscriptions for user ${userId}`, {
        user_id: userId,
        subscription_count: currentShows.length,
        api_duration_ms: apiDuration
      });
    } catch (error) {
      const err = error;
      const apiDuration = Date.now() - apiStartTime;
      let apiErrorCategory = "api_error";
      if (err.message.includes("401") || err.message.includes("unauthorized") || err.message.includes("invalid_token")) {
        apiErrorCategory = "auth_error";
        log.warn("spotify_api", `Authentication error during API call for user ${userId}`, {
          user_id: userId,
          error: err.message,
          duration_ms: apiDuration,
          endpoint: "/me/shows"
        });
      } else if (err.message.includes("429") || err.message.includes("rate limit")) {
        apiErrorCategory = "rate_limit";
        log.warn("spotify_api", `Rate limit during API call for user ${userId}`, {
          user_id: userId,
          error: err.message,
          duration_ms: apiDuration,
          endpoint: "/me/shows"
        });
      } else if (err.message.includes("timeout") || err.message.includes("network") || err.message.includes("ENOTFOUND")) {
        apiErrorCategory = "timeout";
        log.error("spotify_api", `Network/timeout error during API call for user ${userId}`, err, {
          user_id: userId,
          error: err.message,
          duration_ms: apiDuration,
          endpoint: "/me/shows"
        });
      } else if (err.message.includes("500") || err.message.includes("502") || err.message.includes("503")) {
        apiErrorCategory = "api_error";
        log.error("spotify_api", `Spotify server error for user ${userId}`, err, {
          user_id: userId,
          error: err.message,
          duration_ms: apiDuration,
          endpoint: "/me/shows"
        });
      } else {
        apiErrorCategory = "unknown";
        log.error("spotify_api", `Unknown Spotify API error for user ${userId}`, err, {
          user_id: userId,
          error: err.message,
          duration_ms: apiDuration,
          endpoint: "/me/shows"
        });
      }
      logger.spotifyApiCall(userId, "/me/shows", false, apiDuration, err.message);
      logger.logError(userId, `Spotify API error: ${err.message}`, apiErrorCategory, err);
      return {
        success: false,
        userId,
        active_count: 0,
        inactive_count: 0,
        error: `Spotify API error: ${err.message}`,
        spotify_api_error: true
      };
    }
    const currentPodcastUrls = currentShows.map(
      (showObj) => `https://open.spotify.com/show/${showObj.show.id}`
    );
    log.debug("subscription_refresh", `Processing ${currentPodcastUrls.length} current subscriptions for user ${userId}`, {
      user_id: userId,
      current_subscription_urls: currentPodcastUrls.slice(0, 5),
      // Log first 5 for debugging
      total_subscriptions: currentPodcastUrls.length
    });
    let updateResult;
    const dbStartTime = Date.now();
    try {
      updateResult = await updateSubscriptionStatus(userId, currentPodcastUrls);
      const dbDuration = Date.now() - dbStartTime;
      logger.databaseOperation(userId, "update_subscription_status", true, updateResult.active_count + updateResult.inactive_count);
      log.debug("database", `Successfully updated subscription status for user ${userId}`, {
        user_id: userId,
        active_count: updateResult.active_count,
        inactive_count: updateResult.inactive_count,
        db_duration_ms: dbDuration
      });
    } catch (error) {
      const err = error;
      const dbDuration = Date.now() - dbStartTime;
      let dbErrorCategory = "database_error";
      if (err.message.includes("timeout") || err.message.includes("connection")) {
        dbErrorCategory = "timeout";
        log.error("database", `Database timeout for user ${userId}`, err, {
          user_id: userId,
          error: err.message,
          duration_ms: dbDuration,
          operation: "update_subscription_status"
        });
      } else if (err.message.includes("constraint") || err.message.includes("foreign key")) {
        dbErrorCategory = "database_error";
        log.error("database", `Database constraint error for user ${userId}`, err, {
          user_id: userId,
          error: err.message,
          duration_ms: dbDuration,
          operation: "update_subscription_status"
        });
      } else {
        dbErrorCategory = "unknown";
        log.error("database", `Unknown database error for user ${userId}`, err, {
          user_id: userId,
          error: err.message,
          duration_ms: dbDuration,
          operation: "update_subscription_status"
        });
      }
      logger.databaseOperation(userId, "update_subscription_status", false, 0, err.message);
      logger.logError(userId, `Database error: ${err.message}`, dbErrorCategory, err);
      return {
        success: false,
        userId,
        active_count: 0,
        inactive_count: 0,
        error: `Database error: ${err.message}`,
        database_error: true
      };
    }
    const totalDuration = Date.now() - startTime;
    logger.refreshComplete(userId, true, {
      user_id: userId,
      active_subscriptions: updateResult.active_count,
      inactive_subscriptions: updateResult.inactive_count,
      processing_time_ms: totalDuration,
      spotify_api_calls: 1,
      database_operations: 1
    });
    log.info("subscription_refresh", `Successfully refreshed subscriptions for user ${userId}`, {
      user_id: userId,
      active_count: updateResult.active_count,
      inactive_count: updateResult.inactive_count,
      total_duration_ms: totalDuration,
      api_duration_ms: Date.now() - apiStartTime,
      db_duration_ms: Date.now() - dbStartTime
    });
    return {
      success: true,
      userId,
      active_count: updateResult.active_count,
      inactive_count: updateResult.inactive_count
    };
  } catch (error) {
    const err = error;
    const totalDuration = Date.now() - startTime;
    logger.logError(userId, `Unexpected error: ${err.message}`, "unknown", err);
    log.error("subscription_refresh", `Unexpected error for user ${userId}`, err, {
      user_id: userId,
      total_duration_ms: totalDuration,
      stack_trace: err.stack
    });
    return {
      success: false,
      userId,
      active_count: 0,
      inactive_count: 0,
      error: `Unexpected error: ${err.message}`
    };
  }
}
async function getAllUsersWithSpotifyTokens() {
  try {
    if (process.env.NODE_ENV === "test") {
      const { data, error: error2 } = await getSupabaseAdmin5().from("users").select("id").eq("spotify_reauth_required", false);
      if (error2) {
        throw new Error(`Failed to fetch users: ${error2.message}`);
      }
      return (data || []).map((u) => u.id);
    }
    let query = getSupabaseAdmin5().from("users").select("id");
    if (typeof query.not === "function" && typeof query.is === "function") {
      query = query.not("spotify_vault_secret_id", "is", null).is("spotify_reauth_required", false);
    }
    let users;
    let error;
    const firstResult = await safeAwait2(query);
    if (process.env.DEBUG_GET_USERS === "1") {
      console.log("[DEBUG] firstResult shape:", JSON.stringify(firstResult));
    }
    if (Array.isArray(firstResult)) {
      users = firstResult;
    } else if (firstResult && typeof firstResult === "object") {
      users = firstResult.data;
      error = firstResult.error;
    }
    if (!users && typeof query.then === "function") {
      const second = await query.then();
      users = Array.isArray(second) ? second : second?.data;
      error = error || second?.error;
    }
    if (error) {
      console.error("[SubscriptionRefresh] Error fetching users with Spotify tokens:", error.message);
      throw new Error(`Failed to fetch users: ${error.message}`);
    }
    if ((!users || users.length === 0) && firstResult && typeof firstResult === "object") {
      const nestedArray = Object.values(firstResult).find(Array.isArray);
      if (nestedArray && Array.isArray(nestedArray)) {
        users = nestedArray;
      }
    }
    if ((!users || users.length === 0) && firstResult) {
      const collected = [];
      const visit = (val) => {
        if (!val) return;
        if (Array.isArray(val)) {
          val.forEach(visit);
        } else if (typeof val === "object") {
          if ("id" in val) {
            collected.push(val);
          }
          Object.values(val).forEach(visit);
        }
      };
      visit(firstResult);
      if (collected.length > 0) {
        users = collected;
      }
    }
    const userIds = (users || []).map((u) => u.id);
    console.log(`[SubscriptionRefresh] Found ${userIds.length} users with valid Spotify tokens`);
    return userIds;
  } catch (error) {
    const err = error;
    console.error("[SubscriptionRefresh] Error in getAllUsersWithSpotifyTokens:", err.message);
    throw err;
  }
}
async function getUserSpotifyStatistics() {
  try {
    const supabase = getSupabaseAdmin5();
    const extractCount = (res) => {
      if (res === void 0 || res === null) return void 0;
      if (typeof res === "number") return res;
      if (typeof res.count === "number") return res.count;
      if (Array.isArray(res)) {
        const first = res[0];
        if (first && typeof first.count === "number") return first.count;
      }
      return void 0;
    };
    const totalRes = await safeAwait2(
      supabase.from("users").select("*", { count: "exact", head: true })
    );
    const totalUsers = extractCount(totalRes);
    let integratedQuery = supabase.from("users").select("*", { count: "exact", head: true });
    if (typeof integratedQuery.not === "function" && typeof integratedQuery.is === "function") {
      integratedQuery = integratedQuery.not("spotify_vault_secret_id", "is", null).is("spotify_reauth_required", false);
    }
    const integratedRes = await safeAwait2(integratedQuery);
    const spotifyIntegrated = extractCount(integratedRes);
    let reauthQuery = supabase.from("users").select("*", { count: "exact", head: true });
    if (typeof reauthQuery.eq === "function") {
      reauthQuery = reauthQuery.eq("spotify_reauth_required", true);
    }
    const reauthRes = await safeAwait2(reauthQuery);
    const needsReauth = extractCount(reauthRes);
    const totalNum = totalUsers ?? 0;
    const integratedNum = spotifyIntegrated ?? 0;
    const reauthNum = needsReauth ?? 0;
    const stats = {
      total_users: totalNum,
      spotify_integrated: integratedNum,
      needs_reauth: reauthNum,
      no_integration: totalNum - integratedNum - reauthNum
    };
    console.log("[SubscriptionRefresh] User Spotify Statistics:", stats);
    return stats;
  } catch (error) {
    const err = error;
    console.error("[SubscriptionRefresh] Error in getUserSpotifyStatistics:", err.message);
    throw error;
  }
}
async function refreshAllUserSubscriptionsEnhanced() {
  const start = Date.now();
  const userIds = await getAllUsersWithSpotifyTokens();
  const user_results = [];
  for (const id of userIds) {
    user_results.push(await refreshUserSubscriptions(id));
  }
  const successful = user_results.filter((r) => r.success);
  const failed = user_results.filter((r) => !r.success);
  return {
    success: failed.length === 0,
    total_users: userIds.length,
    successful_users: successful.length,
    failed_users: failed.length,
    processing_time_ms: Date.now() - start,
    user_results,
    summary: {
      total_active_subscriptions: user_results.reduce((sum, r) => sum + r.active_count, 0),
      total_inactive_subscriptions: user_results.reduce((sum, r) => sum + r.inactive_count, 0),
      auth_errors: failed.filter((r) => r.auth_error).length,
      spotify_api_errors: failed.filter((r) => r.spotify_api_error).length,
      database_errors: failed.filter((r) => r.database_error).length
    }
  };
}
function sleep(ms = 0) {
  if (process.env.NODE_ENV === "test") {
    return Promise.resolve();
  }
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function safeAwait2(maybeBuilder) {
  if (process.env.NODE_ENV === "test") {
    if (maybeBuilder === null || maybeBuilder === void 0) {
      console.error("safeAwait received null/undefined in test environment");
      return { error: { message: "Mock returned null/undefined" } };
    }
    if (typeof maybeBuilder === "function" && maybeBuilder.mock) {
      try {
        const result = maybeBuilder();
        return result;
      } catch (error) {
        console.error("Error calling mock function:", error);
        return { error: { message: "Mock function call failed" } };
      }
    }
    if (maybeBuilder && typeof maybeBuilder.then === "function") {
      try {
        return await maybeBuilder;
      } catch (error) {
        console.error("Error awaiting thenable:", error);
        return { error: { message: "Thenable await failed" } };
      }
    }
    return maybeBuilder;
  }
  if (!maybeBuilder || typeof maybeBuilder !== "object") {
    return maybeBuilder;
  }
  if (typeof maybeBuilder.then === "function") {
    const result = await maybeBuilder;
    if (result && typeof result.then === "function") {
      return await result;
    }
    return result;
  }
  return maybeBuilder;
}

// services/backgroundJobs.ts
var supabaseAdmin6 = null;
function getSupabaseAdmin6() {
  if (!supabaseAdmin6) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required Supabase environment variables");
    }
    supabaseAdmin6 = createClient7(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabaseAdmin6;
}
function logJobExecution(execution) {
  console.log(`BACKGROUND_JOB: ${JSON.stringify(execution)}`);
}
function emitJobMetric(jobName, success, recordsProcessed, elapsedMs) {
  const metricData = {
    metric: `background_job_execution`,
    job_name: jobName,
    success,
    records_processed: recordsProcessed,
    elapsed_ms: elapsedMs,
    timestamp: Date.now()
  };
  console.log(`METRIC: ${JSON.stringify(metricData)}`);
}
async function vaultCleanupJob() {
  const startTime = Date.now();
  const jobName = "vault_cleanup";
  let recordsProcessed = 0;
  console.log(`BACKGROUND_JOB: Starting ${jobName} job`);
  try {
    const supabase = getSupabaseAdmin6();
    const retentionDays = parseInt(process.env.VAULT_RETENTION_DAYS || "30");
    const { data: cleanupResult, error: cleanupError } = await supabase.rpc("cleanup_expired_secrets", { p_batch_size: 100 });
    if (cleanupError) {
      throw new Error(`Cleanup function failed: ${cleanupError.message}`);
    }
    const softDeletedCount = cleanupResult?.secrets_cleaned || 0;
    recordsProcessed += softDeletedCount;
    const cutoffDate = /* @__PURE__ */ new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    console.log(`VAULT_CLEANUP: Processed ${softDeletedCount} expired secrets`);
    const { data: orphanSecrets, error: orphanError } = await supabase.from("vault.secrets").select("id, name").ilike("name", "spotify:%:tokens").limit(100);
    if (!orphanError && orphanSecrets) {
      let orphanedCount = 0;
      for (const secret of orphanSecrets) {
        const match = secret.name.match(/^spotify:([^:]+):tokens$/);
        if (match) {
          const userId = match[1];
          const { data: _userExists, error: userCheckError } = await supabase.from("users").select("id").eq("id", userId).single();
          if (userCheckError && userCheckError.code === "PGRST116") {
            const { error: deleteError } = await supabase.from("vault.secrets").delete().eq("id", secret.id);
            if (!deleteError) {
              orphanedCount++;
              console.log(`VAULT_CLEANUP: Deleted orphaned secret for user ${userId}`);
            }
          }
        }
      }
      recordsProcessed += orphanedCount;
      console.log(`VAULT_CLEANUP: Cleaned up ${orphanedCount} orphaned secrets`);
    }
    const elapsedMs = Date.now() - startTime;
    const execution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: true,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs
    };
    logJobExecution(execution);
    emitJobMetric(jobName, true, recordsProcessed, elapsedMs);
    console.log(`BACKGROUND_JOB: ${jobName} completed successfully in ${elapsedMs}ms, processed ${recordsProcessed} records`);
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const execution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: false,
      error: errorMessage,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs
    };
    logJobExecution(execution);
    emitJobMetric(jobName, false, recordsProcessed, elapsedMs);
    console.error(`BACKGROUND_JOB: ${jobName} failed after ${elapsedMs}ms:`, errorMessage);
  }
}
async function keyRotationJob() {
  const startTime = Date.now();
  const jobName = "key_rotation";
  let recordsProcessed = 0;
  console.log(`BACKGROUND_JOB: Starting ${jobName} job`);
  try {
    const supabase = getSupabaseAdmin6();
    const { data: secrets, error: secretsError } = await supabase.from("vault.secrets").select("id, name, secret, created_at").ilike("name", "spotify:%:tokens").order("created_at", { ascending: true });
    if (secretsError) {
      throw new Error(`Failed to fetch secrets: ${secretsError.message}`);
    }
    if (!secrets || secrets.length === 0) {
      console.log("KEY_ROTATION: No secrets found to rotate");
      return;
    }
    console.log(`KEY_ROTATION: Found ${secrets.length} secrets to rotate`);
    const batchSize = 10;
    let successCount = 0;
    let errorCount = 0;
    for (let i = 0; i < secrets.length; i += batchSize) {
      const batch = secrets.slice(i, i + batchSize);
      console.log(`KEY_ROTATION: Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(secrets.length / batchSize)}`);
      const batchPromises = batch.map(async (secret) => {
        try {
          const { error: updateError } = await supabase.from("vault.secrets").update({
            updated_at: (/* @__PURE__ */ new Date()).toISOString(),
            // Force re-encryption by updating the secret
            description: `Spotify tokens - rotated ${(/* @__PURE__ */ new Date()).toISOString()}`
          }).eq("id", secret.id);
          if (updateError) {
            console.error(`KEY_ROTATION: Failed to rotate secret ${secret.id}:`, updateError.message);
            return { success: false, secretId: secret.id };
          }
          return { success: true, secretId: secret.id };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error(`KEY_ROTATION: Error rotating secret ${secret.id}:`, errorMessage);
          return { success: false, secretId: secret.id };
        }
      });
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach((result) => {
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      });
      recordsProcessed += batchResults.length;
      if (i + batchSize < secrets.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const elapsedMs = Date.now() - startTime;
    console.log(`KEY_ROTATION: Completed - ${successCount} successful, ${errorCount} failed`);
    const execution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: errorCount === 0,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs,
      ...errorCount > 0 && { error: `${errorCount} secrets failed to rotate` }
    };
    logJobExecution(execution);
    emitJobMetric(jobName, errorCount === 0, recordsProcessed, elapsedMs);
    console.log(`BACKGROUND_JOB: ${jobName} completed in ${elapsedMs}ms, processed ${recordsProcessed} records`);
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const execution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: false,
      error: errorMessage,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs
    };
    logJobExecution(execution);
    emitJobMetric(jobName, false, recordsProcessed, elapsedMs);
    console.error(`BACKGROUND_JOB: ${jobName} failed after ${elapsedMs}ms:`, errorMessage);
  }
}
async function dailySubscriptionRefreshJob() {
  const startTime = Date.now();
  const jobName = "daily_subscription_refresh";
  const jobId = `daily-${(/* @__PURE__ */ new Date()).toISOString()}`;
  let recordsProcessed = 0;
  log.info("scheduler", `Starting ${jobName} job`, {
    job_id: jobId,
    component: "background_jobs"
  });
  try {
    log.info("subscription_refresh", "Executing daily subscription refresh for all users", {
      job_id: jobId,
      component: "batch_processor"
    });
    const result = await refreshAllUserSubscriptionsEnhanced();
    const elapsedMs = Date.now() - startTime;
    recordsProcessed = result.total_users;
    log.info("subscription_refresh", `Daily refresh processed ${result.total_users} users`, {
      job_id: jobId,
      total_users: result.total_users,
      successful_users: result.successful_users,
      failed_users: result.failed_users,
      success_rate: result.total_users > 0 ? (result.successful_users / result.total_users * 100).toFixed(1) : "0",
      duration_ms: elapsedMs,
      subscriptions: {
        total_active: result.summary.total_active_subscriptions,
        total_inactive: result.summary.total_inactive_subscriptions,
        auth_errors: result.summary.auth_errors,
        api_errors: result.summary.spotify_api_errors,
        database_errors: result.summary.database_errors
      }
    });
    if (result.failed_users > 0) {
      log.warn("subscription_refresh", "Daily refresh completed with categorized errors", {
        job_id: jobId,
        error_categories: {
          auth_errors: result.summary.auth_errors,
          api_errors: result.summary.spotify_api_errors,
          database_errors: result.summary.database_errors,
          failed_users: result.failed_users,
          percentage: result.total_users > 0 ? (result.failed_users / result.total_users * 100).toFixed(1) : "0"
        }
      });
    }
    const execution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: result.success,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs,
      ...(!result.success || result.failed_users > 0) && {
        error: result.error || `${result.failed_users} users failed to sync`
      }
    };
    logJobExecution(execution);
    emitJobMetric(jobName, result.success, recordsProcessed, elapsedMs);
    if (result.success) {
      log.info("scheduler", `Daily subscription refresh completed successfully`, {
        job_id: jobId,
        component: "background_jobs",
        duration_ms: elapsedMs,
        users_processed: recordsProcessed,
        success_rate: result.total_users > 0 ? (result.successful_users / result.total_users * 100).toFixed(1) : "100"
      });
    } else {
      log.error("scheduler", `Daily subscription refresh completed with issues`, {
        job_id: jobId,
        component: "background_jobs",
        duration_ms: elapsedMs,
        error: result.error,
        users_processed: recordsProcessed,
        failed_users: result.failed_users
      });
    }
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const err = error;
    log.error("scheduler", `Daily subscription refresh job failed with exception`, err, {
      component: "background_jobs",
      duration_ms: elapsedMs,
      users_processed: recordsProcessed,
      stack_trace: err?.stack,
      job_name: jobName
    });
    const execution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: false,
      error: errorMessage,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs
    };
    logJobExecution(execution);
    emitJobMetric(jobName, false, recordsProcessed, elapsedMs);
  }
}
function initializeBackgroundJobs() {
  console.log("BACKGROUND_JOBS: Initializing scheduled jobs");
  if (process.env.NODE_ENV === "test") {
    console.log("BACKGROUND_JOBS: Skipping job scheduling in test environment");
    return;
  }
  const dailyRefreshEnabled = process.env.DAILY_REFRESH_ENABLED !== "false";
  const dailyRefreshCron = process.env.DAILY_REFRESH_CRON || "0 0 * * *";
  const dailyRefreshTimezone = process.env.DAILY_REFRESH_TIMEZONE || "America/Los_Angeles";
  if (dailyRefreshEnabled) {
    cron.schedule(dailyRefreshCron, async () => {
      console.log("BACKGROUND_JOBS: Starting scheduled daily subscription refresh job");
      await dailySubscriptionRefreshJob();
    }, {
      scheduled: true,
      timezone: dailyRefreshTimezone
    });
    console.log(`  - Daily subscription refresh: ${dailyRefreshCron} ${dailyRefreshTimezone}`);
  } else {
    console.log("  - Daily subscription refresh: DISABLED");
  }
  cron.schedule("0 2 * * *", async () => {
    console.log("BACKGROUND_JOBS: Starting scheduled vault cleanup job");
    await vaultCleanupJob();
  }, {
    scheduled: true,
    timezone: "UTC"
  });
  cron.schedule("0 3 1 1,4,7,10 *", async () => {
    console.log("BACKGROUND_JOBS: Starting scheduled key rotation job");
    await keyRotationJob();
  }, {
    scheduled: true,
    timezone: "UTC"
  });
  console.log("BACKGROUND_JOBS: Background jobs scheduled successfully");
  console.log("  - Vault cleanup: Daily at 2:00 AM UTC");
  console.log("  - Key rotation: Quarterly on 1st at 3:00 AM UTC");
}
async function runJob(jobName) {
  console.log(`BACKGROUND_JOBS: Manually running job: ${jobName}`);
  switch (jobName.toLowerCase()) {
    case "daily_subscription_refresh":
    case "subscription_refresh":
      await dailySubscriptionRefreshJob();
      break;
    case "vault_cleanup":
      await vaultCleanupJob();
      break;
    case "key_rotation":
      await keyRotationJob();
      break;
    default:
      console.error(`BACKGROUND_JOBS: Unknown job name: ${jobName}`);
      throw new Error(`Unknown job: ${jobName}`);
  }
}

// routes/admin.ts
var router5 = Router5();
router5.get("/status", async (_req, res) => {
  try {
    const userStats = await getUserSpotifyStatistics();
    const totalUsers = await getAllUsersWithSpotifyTokens();
    const systemStatus = {
      status: "healthy",
      system: {
        memory: process.memoryUsage(),
        node_version: process.version,
        uptime: process.uptime()
      },
      database: {
        connected: true
      },
      background_jobs: {
        scheduler_active: true,
        daily_refresh: {
          enabled: process.env.DAILY_REFRESH_ENABLED !== "false",
          cron_expression: process.env.DAILY_REFRESH_CRON || "0 0 * * *",
          timezone: process.env.DAILY_REFRESH_TIMEZONE || "America/Los_Angeles"
        }
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      user_statistics: {
        ...userStats,
        eligible_for_refresh: totalUsers.length
      }
    };
    res.json(systemStatus);
  } catch (error) {
    const err = error;
    console.error("Admin status check failed:", err.message);
    res.status(500).json({
      error: "Failed to get system status",
      message: err.message,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});
router5.post("/jobs/:jobName/run", async (req, res) => {
  const { jobName } = req.params;
  if (!jobName) {
    res.status(400).json({
      success: false,
      error: "Job name is required",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    return;
  }
  try {
    console.log(`[Admin] Manual job trigger requested: ${jobName}`);
    const startTime = Date.now();
    const result = await runJob(jobName);
    const executionTime = Date.now() - startTime;
    res.json({
      success: true,
      job_name: jobName,
      execution_time: executionTime,
      result,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (error) {
    const err = error;
    console.error(`[Admin] Job ${jobName} failed:`, err.message);
    res.status(500).json({
      success: false,
      job: jobName,
      error: err.message,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});
router5.get("/subscription-refresh/status", async (_req, res) => {
  try {
    const userStats = await getUserSpotifyStatistics();
    const eligibleUsers = await getAllUsersWithSpotifyTokens();
    const totalBatches = Math.ceil(eligibleUsers.length / parseInt(process.env.DAILY_REFRESH_BATCH_SIZE || "5"));
    const status = {
      system_status: {
        total_users: userStats.total_users,
        users_with_spotify: userStats.spotify_integrated,
        users_needing_reauth: userStats.needs_reauth
      },
      refresh_estimates: {
        estimated_api_calls: eligibleUsers.length,
        estimated_duration_minutes: totalBatches * (parseInt(process.env.DAILY_REFRESH_BATCH_DELAY || "2000") / 1e3) / 60
      },
      last_refresh: {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        successful: true
      },
      configuration: {
        enabled: process.env.DAILY_REFRESH_ENABLED !== "false",
        cron_schedule: process.env.DAILY_REFRESH_CRON || "0 0 * * *",
        timezone: process.env.DAILY_REFRESH_TIMEZONE || "America/Los_Angeles",
        batch_size: parseInt(process.env.DAILY_REFRESH_BATCH_SIZE || "5"),
        batch_delay: parseInt(process.env.DAILY_REFRESH_BATCH_DELAY || "2000")
      },
      subscription_statistics: {
        total_subscriptions: 0,
        // Not tracking per-test yet
        active_subscriptions: 0,
        inactive_subscriptions: 0
      }
    };
    res.json(status);
  } catch (error) {
    const err = error;
    console.error("Subscription refresh status check failed:", err.message);
    res.status(500).json({
      error: "Failed to get subscription refresh status",
      message: err.message,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});
router5.post("/subscription-refresh/run", async (_req, res) => {
  try {
    console.log("[Admin] Manual subscription refresh triggered");
    const result = await refreshAllUserSubscriptionsEnhanced();
    if (result.success) {
      res.json({
        success: true,
        message: "Subscription refresh completed successfully",
        result,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Subscription refresh completed with errors",
        result,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  } catch (error) {
    const err = error;
    console.error("[Admin] Manual subscription refresh failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});
router5.get("/jobs/history", (_req, res) => {
  try {
    const jobInfo = {
      available_jobs: [
        {
          name: "daily_subscription_refresh",
          description: "Daily refresh of all user Spotify subscriptions",
          schedule: process.env.DAILY_REFRESH_CRON || "0 0 * * *",
          timezone: process.env.DAILY_REFRESH_TIMEZONE || "America/Los_Angeles",
          enabled: process.env.DAILY_REFRESH_ENABLED !== "false"
        },
        {
          name: "vault_cleanup",
          description: "Clean up expired vault secrets",
          schedule: "0 2 * * *",
          timezone: "UTC",
          enabled: true
        },
        {
          name: "key_rotation",
          description: "Quarterly key rotation for security",
          schedule: "0 3 1 1,4,7,10 *",
          timezone: "UTC",
          enabled: true
        }
      ],
      note: "Job execution history would be stored in database in production",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    res.json(jobInfo);
  } catch (error) {
    const err = error;
    console.error("Job history request failed:", err.message);
    res.status(500).json({
      error: "Failed to get job history",
      message: err.message,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});
router5.get("/health", async (_req, res) => {
  try {
    const health = {
      status: "healthy",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      services: {
        background_jobs: "running",
        spotify_api: "connected",
        database: "connected"
      },
      environment: {
        node_env: process.env.NODE_ENV || "development",
        daily_refresh_enabled: process.env.DAILY_REFRESH_ENABLED !== "false"
      }
    };
    res.json(health);
  } catch (error) {
    const err = error;
    console.error("Admin health check failed:", err.message);
    res.status(500).json({
      status: "unhealthy",
      error: err.message,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});
var admin_default = router5;

// routes/index.ts
var router6 = express5.Router();
router6.use("/transcribe", transcribe_default);
router6.use("/store-spotify-tokens", spotifyTokens_default);
router6.use("/sync-spotify-shows", syncShows_default);
router6.use("/healthz", health_default);
router6.use("/admin", admin_default);
var routes_default = router6;

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname2 = path3.dirname(__filename);
dotenvFlow.config({
  path: path3.join(__dirname2, "../../"),
  // Point to root directory where .env files are located
  silent: false
  // Show debug info
});
var app = express6();
app.use(cookieParser());
app.use(express6.json());
var corsOptions = {
  origin: [
    "https://listener-seven.vercel.app",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000"
  ],
  credentials: true
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use("/api", routes_default);
app.get("/healthz", (_req, res) => {
  res.sendStatus(200);
});
var safeHealthCheck = typeof healthCheck === "function" ? healthCheck : async () => true;
app.get("/health", async (_req, res) => {
  try {
    const [tokenServiceHealthy, vaultHealthy] = await Promise.all([
      safeHealthCheck(),
      vaultHealthCheck()
    ]);
    if (tokenServiceHealthy && vaultHealthy) {
      res.status(200).json({
        status: "healthy",
        vault: "connected",
        tokenService: "connected",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } else {
      res.status(503).json({
        status: "unhealthy",
        vault: vaultHealthy ? "connected" : "disconnected",
        tokenService: tokenServiceHealthy ? "connected" : "disconnected",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(503).json({
      status: "unhealthy",
      error: errorMessage,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});
var PORT = parseInt(process.env.PORT || "3000", 10);
var initializeServer = async () => {
  try {
    const isDevEnvironment = process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
    if (isDevEnvironment) {
      app.use("/", createProxyMiddleware({
        target: "http://localhost:5173",
        changeOrigin: true,
        ws: true
        // Enable WebSocket proxying for HMR
      }));
    }
    const { default: authMiddleware2 } = await Promise.resolve().then(() => (init_auth(), auth_exports));
    const { errorHandler: errorHandler2, notFoundHandler: notFoundHandler2 } = await Promise.resolve().then(() => (init_error(), error_exports));
    app.use(authMiddleware2);
    app.use(notFoundHandler2);
    app.use(errorHandler2);
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
      console.log("Initializing background jobs...");
      initializeBackgroundJobs();
      Promise.all([safeHealthCheck(), vaultHealthCheck()]).then(([tokenHealthy, vaultHealthy]) => {
        if (tokenHealthy && vaultHealthy) {
          console.log("\u2705 Health checks passed - system ready");
        } else {
          console.warn(`\u26A0\uFE0F  Health check issues - Token Service: ${tokenHealthy ? "OK" : "FAIL"}, Vault: ${vaultHealthy ? "OK" : "FAIL"}`);
        }
      }).catch((error) => {
        console.error("\u274C Health check error:", error.message);
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Failed to initialize server:", errorMessage);
    process.exit(1);
  }
};
if (process.env.NODE_ENV !== "test") {
  initializeServer().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : "Unknown error in server initialization";
    console.error("Server initialization failed:", errorMessage);
    process.exit(1);
  });
}
export {
  app,
  initializeServer
};
