import { initializeApp } from "@firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  confirmPasswordReset,
  updatePassword,
  updateProfile,
  reload,
  type User,
} from "@firebase/auth";
import { type Session, type AuthChangeEvent } from "@supabase/supabase-js";
export function firebaseAuth(config: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}) {
  const a = getAuth(initializeApp(config));
  const session = async (u: User | null): Promise<Session | null> =>
    u && u.emailVerified
      ? ({
          access_token: await u.getIdToken(),
          token_type: "bearer",
          refresh_token: "",
          expires_in: 3600,
          user: {
            id: u.uid,
            email: u.email || undefined,
            user_metadata: { business_name: u.displayName || "" },
            app_metadata: {},
            aud: "authenticated",
            created_at: u.metadata.creationTime || "",
          },
        } as Session)
      : null;
  const error = (e: unknown) =>
    e instanceof Error ? e : Error("Authentication failed.");
  return {
    auth: {
      getSession: async () => {
        await a.authStateReady();
        return { data: { session: await session(a.currentUser) } };
      },
      onAuthStateChange: (
        fn: (event: AuthChangeEvent, s: Session | null) => void,
      ) => {
        let active = true;
        const unsubscribe = onIdTokenChanged(a, (u) => {
          session(u)
            .then((s) => {
              if (active) fn(s ? "SIGNED_IN" : "SIGNED_OUT", s);
            })
            .catch(() => {
              if (active) fn("SIGNED_OUT", null);
            });
        });
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                active = false;
                unsubscribe();
              },
            },
          },
        };
      },
      signUp: async (p: {
        email: string;
        password: string;
        options: { data: { business_name: string }; emailRedirectTo: string };
      }) => {
        try {
          const u = (
            await createUserWithEmailAndPassword(a, p.email, p.password)
          ).user;
          await updateProfile(u, { displayName: p.options.data.business_name });
          await sendEmailVerification(u);
          await signOut(a);
          return { data: { session: null }, error: null };
        } catch (e) {
          await signOut(a).catch(() => {});
          return { data: { session: null }, error: error(e) };
        }
      },
      signInWithPassword: async (p: { email: string; password: string }) => {
        try {
          const u = (await signInWithEmailAndPassword(a, p.email, p.password))
            .user;
          await reload(u);
          if (!u.emailVerified) {
            await signOut(a);
            throw Error("Confirm your email before signing in.");
          }
          return { error: null };
        } catch (e) {
          return { error: error(e) };
        }
      },
      signOut: async () => {
        await signOut(a);
      },
      confirmResetLink: async (link: string, password: string) => {
        let code: string | null;
        try {
          const url = new URL(link.trim());
          if (url.protocol !== "https:" || url.hostname !== config.authDomain ||
              url.pathname !== "/__/auth/action" || url.searchParams.get("mode") !== "resetPassword")
            throw Error();
          code = url.searchParams.get("oobCode");
          if (!code) throw Error();
        } catch {
          throw Error("Paste the full password reset link from your SolarDesk email.");
        }
        try {
          await confirmPasswordReset(a, code, password);
        } catch (e) {
          if (e instanceof Error && "code" in e) {
            if (e.code === "auth/weak-password")
              throw Error("Choose a stronger password and try again.");
            if (e.code === "auth/network-request-failed")
              throw Error("Could not reach Firebase. Check your connection and try again.");
          }
          throw Error("Password reset failed. Request a fresh link and try again.");
        }
      },
      resetPasswordForEmail: async (email: string, _options?: unknown) => {
        try {
          await sendPasswordResetEmail(a, email);
          return { error: null };
        } catch (e) {
          return { error: error(e) };
        }
      },
      updateUser: async (p: { password: string }) => {
        try {
          if (!a.currentUser)
            throw Error("Sign in again before changing your password.");
          await updatePassword(a.currentUser, p.password);
          return { error: null };
        } catch (e) {
          return { error: error(e) };
        }
      },
    },
  };
}
