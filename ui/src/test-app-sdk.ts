/** Stand-in for the host-provided `@kirocrew/app-sdk`, so Vite can resolve it in component tests. */
export function useAppApi(): { get(path: string): Promise<unknown> } {
  throw new Error("@kirocrew/app-sdk is provided by the Crew host; mock it in the test");
}
