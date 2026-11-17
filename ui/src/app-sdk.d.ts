declare module "@kirocrew/app-sdk" {
  export function useAppApi(): { get(path: string): Promise<unknown> };
}
