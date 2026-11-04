export const STORAGE_URL = "https://storage.googleapis.com/example-bucket";
export async function listModules() {
  const res = await fetch(`${STORAGE_URL}/?prefix=app/features/`);
  return res.text();
}
