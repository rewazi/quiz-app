import PocketBase from "pocketbase";

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL);

// keep the auth store in sync across tabs
pb.authStore.onChange(() => {
  document.dispatchEvent(new CustomEvent("pb-auth-change"));
});

export function isLoggedIn() {
  return pb.authStore.isValid;
}

export function currentUser() {
  return pb.authStore.record;
}

export async function login(email, password) {
  return pb.collection("users").authWithPassword(email, password);
}

export async function register(email, password) {
  await pb.collection("users").create({
    email,
    password,
    passwordConfirm: password
  });
  try {
    return await login(email, password);
  } catch (error) {
    error.accountCreated = true;
    throw error;
  }
}

export function logout() {
  pb.authStore.clear();
}
