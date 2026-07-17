import { createMiddleware } from "@tanstack/react-start";
import { getSupabase } from "@/lib/supabase";

/**
 * Attaches the active app session to TanStack server functions.
 *
 * The app uses a singleton auth client with the storage key `enterprise-auth-v1`.
 * The generated auth attacher uses the default storage key, so protected server
 * functions were receiving no bearer token even when the user was logged in.
 */
export const attachAppSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();

  return next({
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
});