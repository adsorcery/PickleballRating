export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initialize } = await import("@/lib/init");
  try {
    await initialize();
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", msg: "startup initialisation failed", error: err instanceof Error ? err.stack : String(err) }),
    );
    throw err;
  }
}
