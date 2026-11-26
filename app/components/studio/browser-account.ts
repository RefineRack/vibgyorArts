import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
} from "firebase/auth";
import { firebaseAuth, googleClientId } from "@/lib/firebase";

type GoogleAccounts = {
  id: {
    initialize: (options: {
      client_id: string;
      callback: (response: { credential: string }) => void;
      auto_select?: boolean;
      cancel_on_tap_outside?: boolean;
      use_fedcm_for_prompt?: boolean;
      itp_support?: boolean;
      context?: "signin" | "signup" | "use";
    }) => void;
    prompt: (
      moment?: (notification: {
        isSkippedMoment?: () => boolean;
        isDismissedMoment?: () => boolean;
        getSkippedReason?: () => string;
        getDismissedReason?: () => string;
      }) => void,
    ) => void;
  };
};

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

type IdentityCredential = Credential & { token?: string };

const BOX_KEY = "vibgyor:box";

export function browserAccountName() {
  if (typeof navigator === "undefined") return "Browser account";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge account";
  if (/CriOS|Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome account";
  if (/Safari\//.test(ua) && !/Chrome|CriOS|FxiOS|Edg\//.test(ua)) return "Safari account";
  if (/Firefox|FxiOS/.test(ua)) return "Firefox account";
  return "Browser account";
}

export function rememberBox(box: unknown) {
  sessionStorage.setItem(BOX_KEY, JSON.stringify(box));
}

export function takeRememberedBox<T>() {
  const raw = sessionStorage.getItem(BOX_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(BOX_KEY);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function authErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "auth/operation-not-allowed") {
    return "Google sign-in is not enabled on this Firebase project yet.";
  }
  if (code === "auth/unauthorized-domain") {
    return "This site is not allowed to use that Google account.";
  }
  if (code === "auth/popup-blocked") {
    return "The browser blocked the Google window.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Closed before the account linked.";
  }
  if (error instanceof Error && /closed|dismiss|cancel/i.test(error.message)) {
    return "Closed before the account linked.";
  }
  return "Could not read the Google account in this browser.";
}

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  provider.addScope("email");
  provider.addScope("profile");
  return provider;
}

function prefersRedirect() {
  const ua = navigator.userAgent;
  const safari = /Safari\//.test(ua) && !/Chrome|CriOS|FxiOS|Edg\//.test(ua);
  const ios = /iPhone|iPad|iPod/.test(ua);
  return safari || ios;
}

async function finishWithToken(auth: Auth, token: string) {
  await signInWithCredential(auth, GoogleAuthProvider.credential(token));
}

async function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google One Tap did not load"));
    document.head.appendChild(script);
  });
}

async function fedcmToken(clientId: string) {
  if (!("credentials" in navigator)) return null;
  const credential = (await navigator.credentials.get({
    identity: {
      context: "signin",
      providers: [
        {
          configURL: "https://accounts.google.com/gsi/fedcm.json",
          clientId,
        },
      ],
    },
    mediation: "required",
  } as CredentialRequestOptions)) as IdentityCredential | null;
  return credential?.token ?? null;
}

async function oneTapToken(clientId: string) {
  await loadGoogleIdentity();
  const google = window.google?.accounts?.id;
  if (!google) throw new Error("Google One Tap did not load");

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, token?: string) => {
      if (settled) return;
      settled = true;
      if (token) resolve(token);
      else reject(error ?? new Error("One tap closed"));
    };

    google.initialize({
      client_id: clientId,
      callback: (response) => finish(undefined, response.credential),
      auto_select: true,
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt: true,
      itp_support: true,
      context: "signin",
    });
    google.prompt((notification) => {
      const skipped = notification.isSkippedMoment?.() ?? false;
      const dismissed = notification.isDismissedMoment?.() ?? false;
      if (!skipped && !dismissed) return;
      const reason = notification.getSkippedReason?.() || notification.getDismissedReason?.() || "closed";
      finish(new Error(reason));
    });
  });
}

async function browserPopup(auth: Auth, box?: unknown) {
  if (prefersRedirect()) {
    if (box) rememberBox(box);
    await signInWithRedirect(auth, googleProvider());
    return;
  }
  await signInWithPopup(auth, googleProvider());
}

export async function signInWithBrowser(box?: unknown) {
  const auth = firebaseAuth();
  if (!auth) throw new Error("Firebase is not configured");
  const clientId = googleClientId();
  if (clientId) {
    try {
      const token = await fedcmToken(clientId);
      if (token) {
        await finishWithToken(auth, token);
        return;
      }
    } catch (error) {
      if (error instanceof Error && /cancel|dismiss|closed/i.test(error.message)) throw error;
    }
  }
  await browserPopup(auth, box);
}

export async function signInWithOneTap(box?: unknown) {
  const auth = firebaseAuth();
  if (!auth) throw new Error("Firebase is not configured");
  const clientId = googleClientId();
  if (!clientId) {
    await browserPopup(auth, box);
    return;
  }
  try {
    const token = await oneTapToken(clientId);
    await finishWithToken(auth, token);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (/closed|dismiss|cancel|tap_outside/i.test(reason)) throw error;
    await browserPopup(auth, box);
  }
}

export async function signOutOfBrowser() {
  const auth = firebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export async function resumeRedirect() {
  const auth = firebaseAuth();
  if (!auth) return;
  await getRedirectResult(auth);
}
